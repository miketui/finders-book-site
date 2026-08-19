/**
 * Owner alerting for inbound contact messages.
 *
 * The contact page promises "a person reads these". Storing the message in a
 * MailerLite group satisfies the record-keeping half of that promise and none
 * of the answering half — nobody is alerted, so the promise depends on someone
 * remembering to log in and look. This posts a notification to whatever endpoint
 * the owner configures (a Slack incoming webhook, a Zapier/Make catch hook, or
 * any URL that accepts JSON).
 *
 * Env:
 *   CONTACT_NOTIFY_WEBHOOK_URL   required by /api/contact; must be HTTPS.
 *
 * This helper reports delivery success/failure explicitly; the caller decides whether failure is fatal.
 */

const NOTIFY_TIMEOUT_MS = 3000;

export function notifyConfigured() {
  const url = process.env.CONTACT_NOTIFY_WEBHOOK_URL;
  return Boolean(url && /^https:\/\//i.test(url));
}

/**
 * Body shape is deliberately dual-purpose: `text` is what Slack renders, and the
 * structured keys are what an automation platform maps into a task or an email.
 */
export function buildNotification({ kind, name, email, message, receivedAt = new Date() }) {
  const label = { question: 'Presale question', feedback: 'Reader feedback', licensing: 'Licensing enquiry' }[kind] || kind;
  const excerpt = String(message ?? '').slice(0, 900);
  return {
    text: `New ${label} from ${name} <${email}>\n\n${excerpt}`,
    source: 'familyfindersbook.com/contact',
    kind,
    name,
    email,
    message: excerpt,
    received_at: receivedAt.toISOString(),
  };
}

export async function notifyOwner(details, { fetchImpl = globalThis.fetch } = {}) {
  if (!notifyConfigured()) return { sent: false, reason: 'not_configured' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(process.env.CONTACT_NOTIFY_WEBHOOK_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildNotification(details)),
    });
    if (res?.ok || res?.status === 200 || res?.status === 204) return { sent: true, status: res.status };
    console.warn('[contact] owner notification rejected', { status: res?.status });
    return { sent: false, reason: 'rejected', status: res?.status };
  } catch (err) {
    console.warn('[contact] owner notification failed', { err: err?.message });
    return { sent: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
