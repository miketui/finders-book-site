/**
 * POST /api/subscribe — Gap Check lead capture.
 *
 * This replaces the public MailerLite JSONP endpoint currently wired into the
 * landing page. That endpoint is public by design: anyone who views source can
 * read it and pump your list. This one keeps the API key server-side and
 * enforces the honeypot and rate limit where devtools cannot reach them.
 *
 * Env:
 *   MAILERLITE_API_KEY            required
 *   ML_GROUP_LEADS                optional, defaults to the live Leads group
 *   MAILERLITE_SUBSCRIBER_STATUS  "unconfirmed" (default) or "active"
 *
 * Keep the default "unconfirmed". The account has double opt-in enabled and the
 * landing page promises a confirmation link — setting "active" here would make
 * the page lie and would skip the consent record you actually want on file.
 */

const ML_API = 'https://connect.mailerlite.com/api/subscribers';
const DEFAULT_LEADS_GROUP = '194226608569059081';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const UPSTREAM_TIMEOUT_MS = 8000;

// Best-effort, per-instance. Serverless instances are recycled, so this blunts
// casual abuse rather than acting as a real security boundary. Vercel's own
// firewall / rate limiting is the control that actually holds.
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

  // Honeypot. A real person never fills a field they cannot see.
  // Return 200 so bots learn nothing from the response shape.
  if (payload.company_website) return res.status(200).json({ ok: true });

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

    // 200 = existing subscriber updated, 201 = created. Both are success.
    if (upstream.status === 200 || upstream.status === 201) {
      return res.status(200).json({ ok: true, status });
    }

    // 422 is usually an already-subscribed address. Treat as success: telling a
    // visitor "you are already on the list" leaks list membership to anyone
    // who wants to probe it.
    if (upstream.status === 422) {
      return res.status(200).json({ ok: true, status: 'existing' });
    }

    const detail = await upstream.text().catch(() => '');
    console.error('[subscribe] mailerlite failed', upstream.status, detail.slice(0, 400));
    return res.status(502).json({
      ok: false,
      error: 'upstream',
      message: 'That did not go through. Please email us and we will send it directly.',
    });
  } catch (err) {
    console.error('[subscribe] error', err?.message || err);
    return res.status(500).json({
      ok: false,
      error: 'server',
      message: 'That did not go through. Please email us and we will send it directly.',
    });
  } finally {
    clearTimeout(timer);
  }
}
