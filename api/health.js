/**
 * GET /api/health?t=PAYHIP_WEBHOOK_TOKEN
 *
 * Confirms which environment variables actually landed in this deployment,
 * without ever echoing a secret value. Use it after setting variables and
 * after every redeploy — Vercel only applies env changes to NEW builds, and a
 * silently-missing key is the most common cause of "the webhook does nothing".
 *
 * Token-gated with either PAYHIP_WEBHOOK_TOKEN or any value in the
 * PAYHIP_WEBHOOK_TOKENS rotation array. The response intentionally reports
 * only presence and behavior flags—not values, hashes, IDs, or map contents.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

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

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const tokens = webhookTokens();
  if (!tokens.length) {
    return res.status(503).json({ ok: false, error: 'not_configured' });
  }
  if (!tokens.some((token) => safeEqual(req.query?.t ?? '', token))) {
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
      PAYHIP_WEBHOOK_TOKEN: tokens.length > 0,
      GAP_CHECK_TOKEN_SECRET: Boolean(process.env.GAP_CHECK_TOKEN_SECRET),
      GA4_MEASUREMENT_ID: Boolean(process.env.GA4_MEASUREMENT_ID),
      GA4_API_SECRET: Boolean(process.env.GA4_API_SECRET),
    },
    behaviour: {
      // Server-side revenue reporting is off until both GA4 values are set, so
      // this flag answers "why is GA4 recording clicks but no purchases?".
      ga4_purchase_reporting: Boolean(process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET),
      contact_owner_alert: Boolean(process.env.CONTACT_NOTIFY_WEBHOOK_URL),
      respect_email_consent: process.env.RESPECT_EMAIL_CONSENT !== 'false',
      refund_on_partial: process.env.REFUND_ON_PARTIAL === 'true',
      lead_status: process.env.MAILERLITE_SUBSCRIBER_STATUS || 'unconfirmed',
      product_map_source: process.env.PAYHIP_PRODUCT_MAP ? 'environment' : 'built_in',
      webhook_token_mode: process.env.PAYHIP_WEBHOOK_TOKENS ? 'rotation_array' : 'single',
    },
  });
}
