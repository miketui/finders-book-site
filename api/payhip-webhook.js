/**
 * POST /api/payhip-webhook
 *
 * Receives Payhip "paid" and "refunded" events and maintains the buyer's
 * complete MailerLite lifecycle state. The endpoint owns group membership so
 * buyer suppression and refund cleanup do not depend on a live automation.
 *
 * ---------------------------------------------------------------------------
 * SECURITY NOTE — READ THIS BEFORE CHANGING THE VERIFICATION LOGIC
 * ---------------------------------------------------------------------------
 * Payhip's documented signature is:
 *
 *     hash('sha256', $apiKey)
 *
 * That is a plain SHA-256 digest of your API key. It is NOT an HMAC over the
 * request body. Consequences:
 *
 *   1. The value is IDENTICAL on every request Payhip ever sends you.
 *   2. It therefore proves nothing about the payload contents.
 *   3. Anyone who ever observes one request can replay or forge any payload.
 *
 * It is a shared bearer token wearing the word "signature". We treat it as
 * exactly that, and add a second factor: an unguessable token on the URL
 * (PAYHIP_WEBHOOK_TOKEN). Payhip lets you paste any URL you like, including a
 * query string, so this costs nothing and closes the replay hole for anyone
 * who does not already hold the URL.
 *
 * Required env:
 *   MAILERLITE_API_KEY      MailerLite > Integrations > API
 *   PAYHIP_API_KEY          Payhip > Settings > Developer
 *
 * Required env:
 *   PAYHIP_WEBHOOK_TOKEN    Random string; appended to the URL as ?t=...
 *
 * Optional env:
 *   ML_GROUP_LEADS / ML_GROUP_ALL_CUSTOMERS / ML_GROUP_ESSENTIALS /
 *   ML_GROUP_ULTIMATE / ML_GROUP_FAMILY_BUNDLE / ML_GROUP_REFUNDED /
 *   ML_GROUP_REVIEW_REQUESTED  Override the baked-in group IDs
 *   PAYHIP_PRODUCT_MAP      JSON, e.g. {"eHcPG":"essentials"} — remap without redeploying
 *   RESPECT_EMAIL_CONSENT   "false" disables the consent gate (default: on)
 *   REFUND_ON_PARTIAL       "true" treats partial refunds as full (default: off)
 */

import { createHash, timingSafeEqual } from 'node:crypto';

const ML_BASE = 'https://connect.mailerlite.com/api';
const UPSTREAM_TIMEOUT_MS = 8000;

/** Live MailerLite1 (account 2202141) group IDs. */
const DEFAULT_GROUPS = {
  leads: '194226608569059081',
  all_customers: '194226612687865798',
  essentials: '194226609478173767',
  ultimate: '194226610412455586',
  family_bundle: '194226611505071661',
  refunded: '194226614527067324',
  review_requested: '194226613598028898',
};

const DEFAULT_PRODUCT_MAP = {
  eHcPG: 'essentials',
  Y1O7B: 'ultimate',
  xPuv4: 'family_bundle',
};

const on = (v, dflt) => (v === undefined ? dflt : String(v).toLowerCase() === 'true');

function groupFor(tier) {
  return process.env[`ML_GROUP_${tier.toUpperCase()}`] || DEFAULT_GROUPS[tier];
}

function productMap() {
  const raw = process.env.PAYHIP_PRODUCT_MAP;
  if (!raw) return DEFAULT_PRODUCT_MAP;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    console.error('[payhip] PAYHIP_PRODUCT_MAP is not valid JSON — falling back to defaults');
  }
  return DEFAULT_PRODUCT_MAP;
}

/** Constant-time compare that does not leak length. */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? ''), 'utf8').digest();
  const hb = createHash('sha256').update(String(b ?? ''), 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * A Payhip line item may identify its product by product_key, and always
 * carries a permalink. We read both — a silent product-key mismatch is the
 * single most likely way for this integration to fail quietly in production.
 */
function candidateKeys(item) {
  const keys = [];
  if (item?.product_key) keys.push(String(item.product_key).trim());
  const permalink = String(item?.product_permalink ?? '');
  const match = permalink.match(/payhip\.com\/b\/([A-Za-z0-9_-]+)/i);
  if (match) keys.push(match[1]);
  return keys;
}

function tiersFromItems(items) {
  const map = productMap();
  const lower = new Map(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  const tiers = new Set();
  const unmatched = [];

  for (const item of Array.isArray(items) ? items : []) {
    let hit = null;
    for (const key of candidateKeys(item)) {
      if (map[key]) { hit = map[key]; break; }
      const ci = lower.get(key.toLowerCase());
      if (ci) { hit = ci; break; }
    }
    if (hit) tiers.add(hit);
    else unmatched.push(item?.product_key ?? item?.product_permalink ?? '(unidentifiable)');
  }
  return { tiers: [...tiers], unmatched };
}

async function ml(path, init = {}) {
  const key = process.env.MAILERLITE_API_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(`${ML_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Upsert the subscriber and set group membership. Purchase callers explicitly
 * pass status "active"; refund callers omit it so an existing unsubscribed
 * subscriber is not deliberately reactivated. Returns the subscriber id.
 */
async function upsert(email, groups, extra = {}) {
  const res = await ml('/subscribers', {
    method: 'POST',
    body: JSON.stringify({ email, groups, ...extra }),
  });

  if (res.status === 200 || res.status === 201) {
    const body = await res.json().catch(() => ({}));
    return body?.data?.id ?? null;
  }
  const detail = await res.text().catch(() => '');
  throw new Error(`mailerlite upsert ${res.status}: ${detail.slice(0, 400)}`);
}

async function removeFromGroup(subscriberId, groupIdValue) {
  if (!subscriberId || !groupIdValue) return;
  const res = await ml(`/subscribers/${subscriberId}/groups/${groupIdValue}`, { method: 'DELETE' });
  // 404 simply means they were not in that group. Not an error.
  if (!res.ok && res.status !== 404) {
    console.error('[payhip] group removal failed', res.status, groupIdValue);
  }
}

function readBody(req) {
  const raw = req.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return { body: raw, malformed: false };
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  try {
    const body = JSON.parse(text);
    return { body: body && typeof body === 'object' ? body : {}, malformed: false };
  } catch {
    return { body: {}, malformed: true };
  }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const mlKey = process.env.MAILERLITE_API_KEY;
  const payhipKey = process.env.PAYHIP_API_KEY;
  const requiredToken = process.env.PAYHIP_WEBHOOK_TOKEN;
  if (!mlKey || !payhipKey || !requiredToken) {
    // 500 (not 200) on purpose: Payhip retries hourly for 3h, so a misconfigured
    // deploy still delivers the sale once you set the variables.
    console.error('[payhip] missing required integration configuration');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  // Second factor — see the security note at the top of this file.
  const supplied = (req.query?.t ?? '') || req.headers['x-webhook-token'] || '';
  if (!safeEqual(supplied, requiredToken)) {
    console.warn('[payhip] rejected: bad or missing URL token');
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const parsed = readBody(req);
  if (parsed.malformed) {
    return res.status(400).json({ ok: false, error: 'malformed_json' });
  }
  const body = parsed.body;
  const expected = createHash('sha256').update(payhipKey, 'utf8').digest('hex');
  if (!safeEqual(body?.signature, expected)) {
    console.warn('[payhip] rejected: signature mismatch');
    return res.status(401).json({ ok: false, error: 'bad_signature' });
  }

  const type = String(body?.type ?? '');
  const email = String(body?.email ?? '').trim().toLowerCase();
  const txId = String(body?.id ?? 'unknown');

  if (!email) {
    console.error('[payhip] no email on event', type, txId);
    return res.status(200).json({ ok: true, action: 'ignored_no_email' });
  }

  try {
    if (type === 'paid') {
      // Payhip reports the buyer's marketing-email choice. Honour it: adding an
      // unconsented buyer to a marketing group is the kind of thing that ends
      // in a complaint, and Payhip already delivers their files by receipt.
      if (on(process.env.RESPECT_EMAIL_CONSENT, true) && body?.unconsented_from_emails === true) {
        console.log('[payhip] paid but unconsented — no marketing groups added', txId);
        return res.status(200).json({ ok: true, action: 'skipped_unconsented' });
      }

      const { tiers, unmatched } = tiersFromItems(body?.items);
      if (unmatched.length) {
        console.error('[payhip] UNMAPPED PRODUCT KEYS — check PAYHIP_PRODUCT_MAP:', unmatched.join(', '));
      }
      if (!tiers.length) {
        return res.status(200).json({ ok: true, action: 'ignored_no_mapped_product', unmatched });
      }

      const groups = [groupFor('all_customers'), ...tiers.map(groupFor)].filter(Boolean);
      const subscriberId = await upsert(email, groups, { status: 'active' });

      // A purchase stops lead sales messages and clears any prior refund flag.
      await Promise.all([
        removeFromGroup(subscriberId, groupFor('refunded')),
        removeFromGroup(subscriberId, groupFor('leads')),
      ]);

      console.log('[payhip] paid ->', tiers.join(','), txId);
      return res.status(200).json({ ok: true, action: 'buyer_added', tiers });
    }

    if (type === 'refunded') {
      const price = Number(body?.price ?? 0);
      const refunded = Number(body?.amount_refunded ?? 0);
      const isFull = price > 0 && refunded >= price;

      if (!isFull && !on(process.env.REFUND_ON_PARTIAL, false)) {
        // A partial refund is usually a goodwill adjustment, not a revocation.
        // Stripping their access and firing the refund email would be wrong.
        console.log('[payhip] partial refund — no group change', txId, refunded, 'of', price);
        return res.status(200).json({ ok: true, action: 'ignored_partial_refund' });
      }

      const subscriberId = await upsert(email, [groupFor('refunded')]);
      // Full refunds leave a suppression marker and remove every group that
      // can trigger onboarding, review, or sales messaging.
      await Promise.all([
        removeFromGroup(subscriberId, groupFor('all_customers')),
        removeFromGroup(subscriberId, groupFor('essentials')),
        removeFromGroup(subscriberId, groupFor('ultimate')),
        removeFromGroup(subscriberId, groupFor('family_bundle')),
        removeFromGroup(subscriberId, groupFor('review_requested')),
        removeFromGroup(subscriberId, groupFor('leads')),
      ]);
      console.log('[payhip] refunded -> suppression and buyer-group cleanup', txId);
      return res.status(200).json({ ok: true, action: 'refund_flagged' });
    }

    // subscription.* events are not used by this product.
    return res.status(200).json({ ok: true, action: 'ignored_event_type', type });
  } catch (err) {
    // 500 so Payhip retries. MailerLite group membership is idempotent and a
    // "joins group" automation will not re-fire for an existing member, so a
    // retry is safe.
    console.error('[payhip] handler error', err?.message || err);
    return res.status(500).json({ ok: false, error: 'processing_failed' });
  }
}
