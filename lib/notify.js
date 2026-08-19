/**
 * Owner alerting for inbound contact messages.
 *
 * Resend email is authoritative: /api/contact only reports success after the
 * owner email provider accepts the message. An optional HTTPS webhook (Slack,
 * Zapier, Make, etc.) remains best-effort secondary alerting and can never turn
 * a failed owner email into a successful visitor submission.
 */

const NOTIFY_TIMEOUT_MS = 4000;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_OWNER_EMAIL = 'info@familyfindersbook.com';
const DEFAULT_FROM_EMAIL = 'info@familyfindersbook.com';
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

function ownerEmail() {
  return String(process.env.CONTACT_OWNER_EMAIL || DEFAULT_OWNER_EMAIL).trim().toLowerCase();
}

function fromEmail() {
  return String(process.env.CONTACT_FROM_EMAIL || DEFAULT_FROM_EMAIL).trim().toLowerCase();
}

export function notifyConfigured() {
  return Boolean(
    process.env.RESEND_CONTACT_API_KEY &&
    EMAIL_RE.test(ownerEmail()) &&
    EMAIL_RE.test(fromEmail())
  );
}

export function secondaryWebhookConfigured() {
  const url = process.env.CONTACT_NOTIFY_WEBHOOK_URL;
  return Boolean(url && /^https:\/\//i.test(url));
}

export function buildNotification({ kind, name, email, message, receivedAt = new Date() }) {
  const label = { question: 'Presale question', feedback: 'Reader feedback', licensing: 'Licensing enquiry' }[kind] || kind;
  const excerpt = String(message ?? '').slice(0, 900);
  return {
    text: `New ${label} from ${name} <${email}>\n\n${excerpt}`,
    source: 'familyfindersbook.com/contact',
    kind,
    label,
    name,
    email,
    message: excerpt,
    received_at: receivedAt.toISOString(),
  };
}

async function timedFetch(fetchImpl, url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sendOwnerEmail(details, fetchImpl) {
  if (!notifyConfigured()) return { sent: false, reason: 'not_configured' };
  const note = buildNotification(details);
  try {
    const res = await timedFetch(fetchImpl, RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_CONTACT_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `The Finder's Book <${fromEmail()}>`,
        to: [ownerEmail()],
        reply_to: note.email,
        subject: `Finder's Book — ${note.label}`,
        text: `${note.text}\n\nReceived: ${note.received_at}\nSource: ${note.source}`,
      }),
    });
    if (res?.ok) return { sent: true, status: res.status };
    console.warn('[contact] owner email rejected', { status: res?.status });
    return { sent: false, reason: 'rejected', status: res?.status };
  } catch (err) {
    console.warn('[contact] owner email failed', { err: err?.message });
    return { sent: false, reason: 'error' };
  }
}

async function sendSecondaryWebhook(details, fetchImpl) {
  if (!secondaryWebhookConfigured()) return { sent: false, reason: 'not_configured' };
  try {
    const res = await timedFetch(fetchImpl, process.env.CONTACT_NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildNotification(details)),
    });
    if (res?.ok || res?.status === 200 || res?.status === 204) return { sent: true, status: res.status };
    console.warn('[contact] secondary owner notification rejected', { status: res?.status });
    return { sent: false, reason: 'rejected', status: res?.status };
  } catch (err) {
    console.warn('[contact] secondary owner notification failed', { err: err?.message });
    return { sent: false, reason: 'error' };
  }
}

export async function notifyOwner(details, { fetchImpl = globalThis.fetch } = {}) {
  const email = await sendOwnerEmail(details, fetchImpl);
  const secondary = await sendSecondaryWebhook(details, fetchImpl);
  return { sent: email.sent, email, secondary };
}
