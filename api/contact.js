/**
 * POST /api/contact — support, feedback, and licensing messages.
 *
 * Support contact is deliberately NOT a marketing subscription event.
 * This route validates the message, applies abuse controls, and sends it to
 * the configured owner-routing webhook. It does not create or update a
 * MailerLite subscriber and therefore cannot trigger marketing DOI or the
 * legacy MailerLite Contact Acknowledgement workflow.
 *
 * CONTACT_NOTIFY_WEBHOOK_URL is authoritative for delivery and must be HTTPS.
 * If owner routing is unavailable, fail loudly so the page can show the
 * support-email fallback instead of pretending a message was delivered.
 */

import { notifyConfigured, notifyOwner } from '../lib/notify.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
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

function readBody(req) {
  const raw = req.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw ?? '');
  try { return JSON.parse(text); } catch { return {}; }
}

function messageForAlert(rawMessage) {
  const raw = String(rawMessage ?? '').trim();
  if (raw.length <= 900) return raw;
  return `${raw.slice(0, 840)} … [truncated, ${raw.length} chars sent]`;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
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

  // Honeypot. Return success-shaped output so bots learn nothing.
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
  if (!['question', 'feedback', 'licensing'].includes(kind)) {
    return res.status(400).json({ ok: false, error: 'invalid_kind' });
  }

  if (!notifyConfigured()) {
    return res.status(503).json({
      ok: false,
      error: 'not_configured',
      message: 'That did not go through. Please email us and we will pick it up there.',
    });
  }

  const message = messageForAlert(rawMessage);
  const delivery = await notifyOwner({ kind, name, email, message });

  if (!delivery?.sent) {
    return res.status(502).json({
      ok: false,
      error: 'upstream',
      message: 'That did not go through. Please email us and we will pick it up there.',
    });
  }

  return res.status(200).json({ ok: true, kind });
}
