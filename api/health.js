/**
 * GET /api/health?t=PAYHIP_WEBHOOK_TOKEN
 *
 * Confirms which environment variables actually landed in this deployment,
 * without ever echoing a secret value. Use it after setting variables and
 * after every redeploy — Vercel only applies env changes to NEW builds, and a
 * silently-missing key is the most common cause of "the webhook does nothing".
 *
 * Token-gated when PAYHIP_WEBHOOK_TOKEN is set, so the config shape is not
 * public. Delete this file before launch if you would rather not ship it.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? ''), 'utf8').digest();
  const hb = createHash('sha256').update(String(b ?? ''), 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/** Never the value — only enough to prove the right key is present. */
function fingerprint(value) {
  if (!value) return null;
  return {
    length: value.length,
    sha256_prefix: createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8),
  };
}

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  const required = process.env.PAYHIP_WEBHOOK_TOKEN;
  if (required && !safeEqual(req.query?.t ?? '', required)) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  return res.status(200).json({
    ok: true,
    deployment: {
      env: process.env.VERCEL_ENV ?? 'unknown',
      region: process.env.VERCEL_REGION ?? 'unknown',
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      node: process.version,
    },
    secrets_present: {
      MAILERLITE_API_KEY: Boolean(process.env.MAILERLITE_API_KEY),
      PAYHIP_API_KEY: Boolean(process.env.PAYHIP_API_KEY),
      PAYHIP_WEBHOOK_TOKEN: Boolean(process.env.PAYHIP_WEBHOOK_TOKEN),
    },
    // Group IDs are not secret — they are visible in the MailerLite dashboard.
    groups: {
      leads: process.env.ML_GROUP_LEADS || '194226608569059081 (default)',
      essentials: process.env.ML_GROUP_ESSENTIALS || '194226609478173767 (default)',
      ultimate: process.env.ML_GROUP_ULTIMATE || '194226610412455586 (default)',
      family_bundle: process.env.ML_GROUP_FAMILY_BUNDLE || '194226611505071661 (default)',
      refunded: process.env.ML_GROUP_REFUNDED || '194226614527067324 (default)',
    },
    behaviour: {
      respect_email_consent: process.env.RESPECT_EMAIL_CONSENT !== 'false',
      refund_on_partial: process.env.REFUND_ON_PARTIAL === 'true',
      lead_status: process.env.MAILERLITE_SUBSCRIBER_STATUS || 'unconfirmed',
      product_map: process.env.PAYHIP_PRODUCT_MAP || 'built-in (eHcPG/Y1O7B/xPuv4)',
    },
    // Proves the PAYHIP_API_KEY you set is the same one Payhip signs with:
    // this prefix must match the first 8 chars of the "signature" field in a
    // real Payhip webhook payload.
    expected_signature_prefix: process.env.PAYHIP_API_KEY
      ? createHash('sha256').update(process.env.PAYHIP_API_KEY, 'utf8').digest('hex').slice(0, 8)
      : null,
    mailerlite_key_fingerprint: fingerprint(process.env.MAILERLITE_API_KEY),
  });
}
