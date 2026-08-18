/**
 * POST /api/gap-check-subscribe
 *
 * Subscribes an email to the Leads group and returns
 * a short-lived HMAC-signed download token so the client can fetch the Gap
 * Check PDF through /api/gap-check-download?token=... instead of a bare
 * public URL.
 *
 * Token format: base64url(JSON{exp}) + "." + base64url(HMAC-SHA256)
 * Tokens expire after 15 minutes. The download handler verifies the signature
 * and expiry before streaming the file.
 *
 * Env:
 *   MAILERLITE_API_KEY            required
 *   GAP_CHECK_TOKEN_SECRET        required — at least 32 random bytes in hex
 *   ML_GROUP_LEADS                optional, defaults to the live Leads group
 *   MAILERLITE_SUBSCRIBER_STATUS  "unconfirmed" (default) or "active"
 */

import { createHmac } from 'node:crypto';

const ML_API = 'https://connect.mailerlite.com/api/subscribers';
const DEFAULT_LEADS_GROUP = '194226608569059081';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UPSTREAM_TIMEOUT_MS = 8000;
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

// per-instance rate limit (blunts abuse; real boundary is Vercel firewall)
const RECENT = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function limited(ip) {
  const now = Date.now();
  const hits = (RECENT.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  RECENT.set(ip, hits);
  if (RECENT.size > 5000) RECENT.clear();
  return hits.length > MAX_PER_WINDOW;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function makeToken(secret) {
  const payload = b64url(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

function readBody(req) {
  const raw = req.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  try { return JSON.parse(text); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const key = process.env.MAILERLITE_API_KEY;
  const secret = process.env.GAP_CHECK_TOKEN_SECRET;

  if (!key || !secret || secret.length < 32) {
    return res.status(503).json({
      ok: false,
      error: 'not_configured',
      message: 'The signup form is not connected yet.',
    });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.headers['x-real-ip'] ||
    'unknown';

  if (limited(ip)) {
    return res.status(429).json({
      ok: false,
      error: 'rate_limited',
      message: 'Too many attempts. Try again in a minute.',
    });
  }

  const payload = readBody(req);

  // Honeypot: return 200 so bots learn nothing
  if (payload.company_website) {
    return res.status(200).json({ ok: true });
  }

  const email = String(payload.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_email',
      message: 'Please enter a valid email address.',
    });
  }

  const name = String(payload.name ?? '').trim().slice(0, 80);
  const groupId = process.env.ML_GROUP_LEADS || DEFAULT_LEADS_GROUP;
  const status = process.env.MAILERLITE_SUBSCRIBER_STATUS || 'unconfirmed';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(ML_API, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        status,
        groups: [groupId],
        ...(name ? { fields: { name } } : {}),
      }),
    });

    if (upstream.status === 200 || upstream.status === 201 || upstream.status === 422) {
      // 422 = already subscribed — still gets the download
      return res.status(200).json({ ok: true, token: makeToken(secret) });
    }

    const detail = await upstream.text().catch(() => '');
    console.error('[gap-check-subscribe] mailerlite failed', upstream.status, detail.slice(0, 400));
    return res.status(502).json({
      ok: false,
      error: 'upstream',
      message: 'That did not go through. Please email us and we will send it directly.',
    });
  } catch (err) {
    console.error('[gap-check-subscribe] error', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'server',
      message: 'That did not go through. Please email us and we will send it directly.',
    });
  } finally {
    clearTimeout(timer);
  }
}
