/**
 * GA4 Measurement Protocol transport.
 *
 * Why this exists: a `checkout_click` is not a purchase. The browser hands the
 * visitor to Payhip and never learns whether money changed hands, so revenue can
 * only be reported from the server that receives the Payhip webhook.
 *
 * Rules this module keeps:
 *   - No customer PII ever leaves this process. No email, name, address, or IP.
 *     The GA4 client_id is a one-way hash of the Payhip transaction id.
 *   - Never throws into the caller. Analytics must not be able to fail a
 *     webhook and make Payhip retry a delivery that already succeeded.
 *   - No-op unless GA4_MEASUREMENT_ID and GA4_API_SECRET are both configured,
 *     so preview deployments and local tests stay silent by default.
 *
 * Deduplication: GA4 deduplicates repeated `purchase` events that carry the same
 * transaction_id, so a Payhip redelivery of the same order does not create a
 * second purchase. https://support.google.com/analytics/answer/12313109
 */

import { createHash } from 'node:crypto';

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect';
const GA4_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect';
const GA4_TIMEOUT_MS = 3000;

export function ga4Configured() {
  return Boolean(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET);
}

/**
 * Stable pseudonymous client id in GA4's `<int>.<int>` shape.
 *
 * Seeded from the transaction id rather than the buyer's email on purpose: the
 * hash never has to be reversible, and a per-order id keeps the customer's
 * address out of every hash we compute. The cost is that two orders from the
 * same person look like two users in GA4, which is the right trade for a
 * low-volume digital product.
 */
export function ga4ClientId(seed) {
  const digest = createHash('sha256').update(`finders-book:${String(seed ?? '')}`, 'utf8').digest('hex');
  const high = parseInt(digest.slice(0, 9), 16);
  const low = parseInt(digest.slice(9, 18), 16);
  return `${high}.${low}`;
}

/** Payhip sends money as an integer number of minor units (4900 === $49.00). */
export function minorUnitsToAmount(value) {
  const cents = Number(value);
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return Math.round(cents) / 100;
}

/**
 * Map Payhip line items onto GA4 ecommerce items.
 * `tierFor` resolves a product key to an internal tier name and may return null.
 */
export function ga4Items(items, tierFor = () => null) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    const key = typeof item?.product_key === 'string' ? item.product_key.trim() : '';
    const tier = key ? tierFor(key) : null;
    const quantity = Number.parseInt(item?.quantity, 10);
    const entry = {
      item_id: key || tier || `item_${index + 1}`,
      item_name: typeof item?.product_name === 'string' && item.product_name.trim()
        ? item.product_name.trim()
        : "The Finder's Book",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    };
    if (tier) entry.item_category = tier;
    const price = Number(item?.price);
    if (Number.isFinite(price) && price > 0) entry.price = minorUnitsToAmount(price);
    return entry;
  });
}

/**
 * Build the Measurement Protocol body for one ecommerce event.
 * `name` is a GA4 recommended event: 'purchase' or 'refund'.
 * https://support.google.com/analytics/answer/14143583
 */
export function buildGa4Payload(name, { transactionId, amountMinorUnits, currency, items = [] } = {}) {
  return {
    client_id: ga4ClientId(transactionId),
    non_personalized_ads: false,
    events: [
      {
        name,
        params: {
          transaction_id: String(transactionId ?? ''),
          value: minorUnitsToAmount(amountMinorUnits),
          currency: String(currency || 'USD').toUpperCase(),
          affiliation: 'Payhip',
          items,
          // GA4 discards server events that report no engagement time.
          engagement_time_msec: 1,
        },
      },
    ],
  };
}

/**
 * Post one ecommerce event. Resolves to a result object; never rejects.
 * Set GA4_DEBUG=true to route to the validation endpoint, which reports payload
 * problems instead of recording data.
 */
export async function sendGa4Event(name, details = {}, { fetchImpl = globalThis.fetch } = {}) {
  if (!ga4Configured()) return { sent: false, reason: 'not_configured' };
  if (!details?.transactionId) return { sent: false, reason: 'missing_transaction_id' };

  const debug = String(process.env.GA4_DEBUG || '').toLowerCase() === 'true';
  const base = debug ? GA4_DEBUG_ENDPOINT : GA4_ENDPOINT;
  const url = `${base}?measurement_id=${encodeURIComponent(process.env.GA4_MEASUREMENT_ID)}`
    + `&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GA4_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildGa4Payload(name, details)),
    });
    // A live collect call answers 204 with no body. Anything else is worth a log
    // line, but never worth failing the webhook over.
    if (res?.status === 204 || res?.status === 200) {
      if (debug) {
        const detail = await res.text?.().catch(() => '') ?? '';
        console.log('[ga4] validation response', String(detail).slice(0, 400));
      }
      return { sent: true, status: res.status };
    }
    console.warn('[ga4] measurement protocol rejected the event', { event: name, status: res?.status });
    return { sent: false, reason: 'rejected', status: res?.status };
  } catch (err) {
    console.warn('[ga4] measurement protocol call failed', { event: name, err: err?.message });
    return { sent: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
