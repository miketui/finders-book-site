/**
 * POST /api/contact — contact and feedback form.
 *
 * Replaces the unwired client-side MailerLite JSONP stub that shipped in
 * contact.js. Two reasons it had to move server-side:
 *
 *   1. Browser form submissions are intentionally limited to same-origin API
 *      routes. MailerLite is called only from this server-side function, so no
 *      MailerLite browser origin needs to be allowed by the site CSP.
 *   2. The JSONP endpoint is public by design. Anyone reading source could
 *      pump the list. Keeping the key server-side puts the honeypot and the
 *      rate limit where devtools cannot reach them, exactly as the Gap Check
 *      already does for the Gap Check.
 *
 * ROUTING RULE (unchanged from the original design intent)
 * Contact and feedback must NOT land in the Leads group. Someone asking where
 * their download went should never be dropped into the Gap Check nurture
 * sequence. Each message kind gets its own group.
 *
 * CONSENT
 * Subscribers are created "unconfirmed", matching the Gap Check flow. Unconfirmed
 * subscribers sit on file so you can reply, but are not marketable, which is
 * the correct posture for someone who sent a support message and never asked
 * for marketing. The contact page makes no marketing promise and carries no
 * opt-in checkbox, so there is no consent to record.
 *
 * Env:
 *   MAILERLITE_API_KEY            required
 *   ML_GROUP_CONTACT_QUESTION     optional, defaults to the live group
 *   ML_GROUP_CONTACT_FEEDBACK     optional, defaults to the live group
 *   ML_GROUP_CONTACT_LICENSING    optional, defaults to the live group
 *   MAILERLITE_SUBSCRIBER_STATUS  "unconfirmed" (default) or "active"
 *   CONTACT_NOTIFY_WEBHOOK_URL    optional; alerts the owner so replying does
 *                                 not depend on remembering to check MailerLite
 */

import { notifyOwner } from '../lib/notify.js';

const ML_API = 'https://connect.mailerlite.com/api/subscribers';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UPSTREAM_TIMEOUT_MS = 8000;

/** Live MailerLite (account 2202141) contact routing groups. */
const DEFAULT_GROUPS = {
  question: '195847261261923400',
  feedback: '195847261915186382',
  licensing: '195847263345444315',
};

/** MailerLite text fields truncate. Keep the stored copy short and honest. */
const MESSAGE_LIMIT = 1000;

// Best-effort, per-instance. Serverless instances are recycled, so this blunts
// casual abuse rather than acting as a real security boundary. Vercel's own
// firewall / rate limiting is the control that actually holds.
const RECENT = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 3;

function limited(ip) {
  const now = Date.now();
  const hits = (RECENT.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  RECENT.set(ip, hits);
  if (RECENT.size > 5000) RECENT.clear();
  return hits.length > MAX_PER_WINDOW;
}

function groupFor(kind) {
  const override = process.env[`ML_GROUP_CONTACT_${kind.toUpperCase()}`];
  return override || DEFAULT_GROUPS[kind];
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
  if (!key) {
    // A form that looks like it worked but did not is worse than one that
    // plainly says it is not connected.
    return res.status(503).json({
      ok: false,
      error: 'not_configured',
      message: 'The message form is not connected yet.',
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
      message: 'Too many messages. Try again in a minute.',
    });
  }

  const payload = readBody(req);

  // Honeypot. A real person never fills a field they cannot see.
  // Return 200 so bots learn nothing from the response shape.
  if (payload.company_website) return res.status(200).json({ ok: true });

  const email = String(payload.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_email',
      message: 'Please enter an email address we can reply to.',
    });
  }

  const name = String(payload.name ?? '').trim().slice(0, 80);
  if (!name) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_name',
      message: 'Please add a name so we know who we are replying to.',
    });
  }

  const rawMessage = String(payload.message ?? '').trim();
  if (rawMessage.length < 10) {
    return res.status(400).json({
      ok: false,
      error: 'invalid_message',
      message: 'Please add a little more detail so we can actually help.',
    });
  }

  const kind = String(payload.kind ?? 'question').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_GROUPS, kind)) {
    return res.status(400).json({ ok: false, error: 'invalid_kind' });
  }

  const groupId = groupFor(kind);
  if (!groupId) {
    return res.status(503).json({
      ok: false,
      error: 'not_configured',
      message: 'The message form is not connected yet.',
    });
  }

  const message =
    rawMessage.length > MESSAGE_LIMIT
      ? `${rawMessage.slice(0, MESSAGE_LIMIT)} […truncated, ${rawMessage.length} chars sent]`
      : rawMessage;

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
        fields: {
          name,
          contact_message: message,
          contact_kind: kind,
        },
      }),
    });

    // 200 = existing subscriber updated, 201 = created, 422 = already present.
    // All three mean the message is on file and a person can reply to it.
    if (upstream.status === 200 || upstream.status === 201 || upstream.status === 422) {
      // Best effort by design: the message is already on file, so a failed
      // alert is a monitoring problem, not the sender's problem.
      await notifyOwner({ kind, name, email, message });
      return res.status(200).json({ ok: true, kind });
    }

    const detail = await upstream.text().catch(() => '');
    console.error('[contact] mailerlite failed', upstream.status, detail.slice(0, 400));
    return res.status(502).json({
      ok: false,
      error: 'upstream',
      message: 'That did not go through. Please email us and we will pick it up there.',
    });
  } catch (err) {
    console.error('[contact] error', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'server',
      message: 'That did not go through. Please email us and we will pick it up there.',
    });
  } finally {
    clearTimeout(timer);
  }
}
