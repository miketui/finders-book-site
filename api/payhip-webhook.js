/**
 * POST /api/payhip-webhook
 *
 * Receives Payhip events and maintains MailerLite group membership.
 * Hardened to support flexible PAYHIP_PRODUCT_MAP keys (literal, case-insensitive,
 * and regex-style keys) and added retry semantics for upserts on transient
 * MailerLite 5xx/429 responses. Exposes helpers for unit testing.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { ga4Items, sendGa4Event } from '../lib/ga4.js';

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
const ALLOWED_TIERS = new Set(['essentials', 'ultimate', 'family_bundle']);

const on = (v, dflt) => (v === undefined ? dflt : String(v).toLowerCase() === 'true');

function groupFor(tier) {
  return process.env[`ML_GROUP_${tier.toUpperCase()}`] || DEFAULT_GROUPS[tier];
}

/**
 * Parse PAYHIP_PRODUCT_MAP env which can be JSON object of the form:
 * { "eHcPG": "essentials", "/^prefix-\\d+$/": "family_bundle" }
 * Keys that start and end with '/' are treated as regex patterns. Values must
 * be tier strings. Falls back to DEFAULT_PRODUCT_MAP on parse failure.
 */
function productMap() {
  const raw = process.env.PAYHIP_PRODUCT_MAP;
  if (!raw) return DEFAULT_PRODUCT_MAP;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object');
    }
    const entries = Object.entries(parsed);
    if (!entries.length || entries.some(([key, tier]) => !key || !ALLOWED_TIERS.has(String(tier)))) {
      throw new Error('contains an empty key or unsupported tier');
    }
    return parsed;
  } catch (err) {
    console.error('[payhip] invalid PAYHIP_PRODUCT_MAP configuration', err?.message);
    throw new Error('invalid PAYHIP_PRODUCT_MAP configuration');
  }
}

/** Constant-time compare that does not leak length. */
function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? ''), 'utf8').digest();
  const hb = createHash('sha256').update(String(b ?? ''), 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

function webhookTokens() {
  const rotated = process.env.PAYHIP_WEBHOOK_TOKENS;
  if (rotated) {
    try {
      const parsed = JSON.parse(rotated);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(String).map((token) => token.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
  return process.env.PAYHIP_WEBHOOK_TOKEN ? [process.env.PAYHIP_WEBHOOK_TOKEN] : [];
}

/**
 * A Payhip line item may identify its product by product_key, and often
 * carries a permalink. Tolerate missing/odd shapes safely.
 */
export function candidateKeys(item) {
  const keys = [];
  if (!item || typeof item !== 'object') return keys;
  if (item.product_key && typeof item.product_key === 'string') keys.push(String(item.product_key).trim());
  if (item.product_permalink && typeof item.product_permalink === 'string') {
    const permalink = item.product_permalink;
    const match = permalink.match(/payhip\.com\/b\/([A-Za-z0-9_-]+)/i);
    if (match) keys.push(match[1]);
  }
  return keys;
}

/**
 * Map item product keys to tiers.
 * Supports literal map keys and regex keys (map key string starting and ending
 * with '/'). Matching order: exact literal, case-insensitive literal, regex.
 */
export function tiersFromItems(items) {
  const map = productMap();
  const lower = new Map();
  const regexEntries = [];
  for (const [k, v] of Object.entries(map)) {
    if (typeof k !== 'string') continue;
    if (k.startsWith('/') && k.endsWith('/')) {
      try { regexEntries.push([new RegExp(k.slice(1, -1), 'i'), v]); } catch (e) { console.warn('[payhip] invalid regex in PAYHIP_PRODUCT_MAP key', k); }
    } else {
      lower.set(k.toLowerCase(), v);
    }
  }

  const tiers = new Set();
  const unmatched = [];

  if (!Array.isArray(items)) return { tiers: [], unmatched: ['(items_not_array)'] };

  for (const item of items) {
    let hit = null;
    const keys = candidateKeys(item);
    for (const key of keys) {
      if (map[key]) { hit = map[key]; break; }
      const ci = lower.get(String(key).toLowerCase());
      if (ci) { hit = ci; break; }
      // regex match
      for (const [re, v] of regexEntries) {
        try {
          if (re.test(String(key))) { hit = v; break; }
        } catch (e) { /* ignore */ }
      }
      if (hit) break;
    }
    if (hit) tiers.add(hit);
    else unmatched.push(item?.product_key ?? item?.product_permalink ?? JSON.stringify(item) ?? '(unidentifiable)');
  }
  return { tiers: [...tiers], unmatched };
}

/** Resolve one product key to a tier, reusing the same matching rules as tiersFromItems. */
export function tierForKey(key) {
  const { tiers } = tiersFromItems([{ product_key: key }]);
  return tiers[0] ?? null;
}

/**
 * Report revenue to GA4 from the server, because the browser hands the visitor
 * to Payhip and never learns whether the order completed. Deliberately awaited
 * but never allowed to throw: a failed analytics call must not turn a completed
 * order into a Payhip retry.
 */
async function reportToGa4(eventName, body, amountMinorUnits) {
  try {
    const result = await sendGa4Event(eventName, {
      transactionId: String(body?.id ?? ''),
      amountMinorUnits,
      currency: body?.currency,
      items: ga4Items(body?.items, tierForKey),
    });
    if (result.sent) console.log(`[payhip] ga4 ${eventName} recorded`, { txId: String(body?.id ?? '') });
    else if (result.reason !== 'not_configured') {
      console.warn(`[payhip] ga4 ${eventName} not recorded`, { reason: result.reason, status: result.status });
    }
  } catch (err) {
    console.warn('[payhip] ga4 reporting threw unexpectedly', { event: eventName, err: err?.message });
  }
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
 * Upsert with retries on 429 and 5xx. Returns subscriber id on success.
 */
async function upsertWithRetries(email, groups, extra = {}, { attempts = 3, baseDelay = 250 } = {}) {
  const bodyPayload = JSON.stringify({ email, groups, ...extra });
  const path = '/subscribers';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await ml(path, { method: 'POST', body: bodyPayload });
    if (res.status === 200 || res.status === 201) {
      const body = await res.json().catch(() => ({}));
      return body?.data?.id ?? null;
    }
    if (res.status === 422) {
      // already subscribed — parse and return id if present
      const body = await res.json().catch(() => ({}));
      return body?.data?.id ?? null;
    }
    const text = await res.text().catch(() => '');
    // Retry on 429 or 5xx
    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      console.warn('[payhip] upsert attempt failed, will retry', { attempt, status: res.status, snippet: String(text).slice(0,200) });
      if (attempt < attempts) await sleep(baseDelay * attempt);
      continue;
    }
    throw new Error(`mailerlite upsert ${res.status}: ${text.slice(0,400)}`);
  }
  throw new Error('mailerlite upsert failed after retries');
}

async function currentGroupIds(subscriberId) {
  if (!subscriberId) throw new Error('mailerlite subscriber id missing');
  const res = await ml(`/subscribers/${subscriberId}`, { method: 'GET' });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`mailerlite subscriber fetch ${res.status}: ${detail.slice(0, 400)}`);
  }
  const body = await res.json().catch(() => ({}));
  if (!Array.isArray(body?.data?.groups)) {
    throw new Error('mailerlite subscriber response omitted groups');
  }
  return new Set(body.data.groups.map((group) => String(group?.id ?? group)).filter(Boolean));
}

async function removeFromGroup(subscriberId, groupIdValue, { attempts = 3, baseDelay = 250 } = {}) {
  if (!subscriberId || !groupIdValue) return;
  const path = `/subscribers/${subscriberId}/groups/${groupIdValue}`;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await ml(path, { method: 'DELETE' });
    if (res.ok || res.status === 404) return;
    const detail = await res.text().catch(() => '');
    console.warn('[payhip] mailerlite group removal attempt failed', { attempt, status: res.status, snippet: String(detail).slice(0,200) });
    if (attempt < attempts) await sleep(baseDelay * attempt);
    else throw new Error(`mailerlite group removal ${res.status}: ${detail.slice(0,400)}`);
  }
}

function readBody(req) {
  const raw = req.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return { body: raw, malformed: false };
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  try { const body = JSON.parse(text); return { body: body && typeof body === 'object' ? body : {}, malformed: false }; } catch { return { body: {}, malformed: true }; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const mlKey = process.env.MAILERLITE_API_KEY;
  const payhipKey = process.env.PAYHIP_API_KEY;
  const tokens = webhookTokens();
  if (!mlKey || !payhipKey || !tokens.length) {
    console.error('[payhip] missing required integration configuration');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  const supplied = (req.query?.t ?? '') || req.headers['x-webhook-token'] || '';
  const okToken = tokens.some((t) => safeEqual(supplied, t));
  if (!okToken) {
    console.warn('[payhip] rejected: bad or missing URL token');
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const parsed = readBody(req);
  if (parsed.malformed) return res.status(400).json({ ok: false, error: 'malformed_json' });
  const body = parsed.body;

  const expected = createHash('sha256').update(payhipKey, 'utf8').digest('hex');
  if (!safeEqual(body?.signature, expected)) {
    console.warn('[payhip] rejected: signature mismatch', { id: body?.id });
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
      if (on(process.env.RESPECT_EMAIL_CONSENT, true) && body?.unconsented_from_emails === true) {
        console.log('[payhip] paid but unconsented — no marketing groups added', txId);
        // Declining marketing email does not erase the sale. GA4 receives no
        // identifiers, so revenue is still reported.
        await reportToGa4('purchase', body, body?.price);
        return res.status(200).json({ ok: true, action: 'skipped_unconsented' });
      }

      const { tiers, unmatched } = tiersFromItems(body?.items);
      if (unmatched.length) console.error('[payhip] UNMAPPED PRODUCT KEYS', { txId, unmatched: unmatched.slice(0,10) });
      if (!tiers.length) return res.status(500).json({ ok: false, error: 'unmapped_product' });

      const groups = [groupFor('all_customers'), ...tiers.map(groupFor)].filter(Boolean);
      const subscriberId = await upsertWithRetries(email, groups, { status: 'active' });

      // Best-effort: removals on purchase are non-fatal.
      await Promise.all([
        removeFromGroup(subscriberId, groupFor('refunded')).catch((e) => console.warn('[payhip] non-fatal removeFromGroup(refunded) failed', { err: e?.message })),
        removeFromGroup(subscriberId, groupFor('leads')).catch((e) => console.warn('[payhip] non-fatal removeFromGroup(leads) failed', { err: e?.message })),
      ]);

      await reportToGa4('purchase', body, body?.price);

      console.log('[payhip] paid ->', tiers.join(','), txId);
      return res.status(200).json({ ok: true, action: 'buyer_added', tiers });
    }

    if (type === 'refunded') {
      const price = Number(body?.price ?? 0);
      const refunded = Number(body?.amount_refunded ?? 0);
      const isFull = price > 0 && refunded >= price;

      if (!isFull && !on(process.env.REFUND_ON_PARTIAL, false)) {
        console.log('[payhip] partial refund — no group change', txId, refunded, 'of', price);
        // Entitlements stay, but the money did move. Reporting it keeps GA4
        // revenue reconcilable against Payhip.
        await reportToGa4('refund', body, refunded);
        return res.status(200).json({ ok: true, action: 'ignored_partial_refund' });
      }

      const { tiers, unmatched } = tiersFromItems(body?.items);
      if (unmatched.length) console.error('[payhip] UNMAPPED REFUND PRODUCT KEYS', { txId, unmatched: unmatched.slice(0,10) });
      if (!tiers.length) return res.status(500).json({ ok: false, error: 'unmapped_product' });

      const subscriberId = await upsertWithRetries(email, [groupFor('refunded')]);
      const memberships = await currentGroupIds(subscriberId);
      const refundedGroups = tiers.map(groupFor).filter(Boolean);
      const buyerGroups = ['essentials', 'ultimate', 'family_bundle'].map(groupFor).filter(Boolean);
      const remainingBuyerGroups = buyerGroups.filter((groupId) => memberships.has(String(groupId)) && !refundedGroups.includes(groupId));

      const removals = [
        ...refundedGroups,
        ...(remainingBuyerGroups.length === 0 ? [groupFor('all_customers')] : []),
        groupFor('review_requested'),
        groupFor('leads'),
      ].filter(Boolean);

      for (const groupId of removals) {
        try {
          await removeFromGroup(subscriberId, groupId, { attempts: 3 });
        } catch (e) {
          console.error('[payhip] failed to remove group during refund cleanup — will surface 500 so Payhip retries', { err: e?.message });
          throw e;
        }
      }

      await reportToGa4('refund', body, refunded || price);

      const remainingTiers = ['essentials', 'ultimate', 'family_bundle'].filter((tier) => remainingBuyerGroups.includes(groupFor(tier)));
      console.log('[payhip] refunded -> item-scoped cleanup', tiers.join(','), txId);
      return res.status(200).json({ ok: true, action: 'refund_flagged', refunded_tiers: tiers, remaining_tiers: remainingTiers });
    }

    return res.status(200).json({ ok: true, action: 'ignored_event_type', type });
  } catch (err) {
    console.error('[payhip] handler error', err?.message || err, { id: txId });
    return res.status(500).json({ ok: false, error: 'processing_failed' });
  }
}
