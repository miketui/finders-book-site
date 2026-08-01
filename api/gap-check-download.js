/**
 * GET /api/gap-check-download?token=...
 *
 * Verifies the HMAC-signed token produced by /api/gap-check-subscribe and
 * streams Family-Readiness-Gap-Check.pdf to the client with a
 * Content-Disposition: attachment header.
 *
 * Token format: base64url(JSON{email,exp}) + "." + base64url(HMAC-SHA256)
 * Tokens expire after 15 minutes (set at issue time by gap-check-subscribe).
 *
 * Env:
 *   GAP_CHECK_TOKEN_SECRET  required — must match the secret used at issue time
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PDF_PATH = join(ROOT, 'Family-Readiness-Gap-Check.pdf');
const PDF_NAME = 'Family-Readiness-Gap-Check.pdf';

function b64urlDecode(s) {
  // Restore padding and convert from URL-safe base64
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padding), 'base64');
}

function verifyToken(token, secret) {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;

  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  const expectedSig = Buffer.from(
    createHmac('sha256', secret).update(payloadPart).digest()
  );

  let providedSig;
  try { providedSig = b64urlDecode(sigPart); } catch { return null; }

  if (expectedSig.length !== providedSig.length) return null;
  if (!timingSafeEqual(expectedSig, providedSig)) return null;

  let claims;
  try { claims = JSON.parse(b64urlDecode(payloadPart).toString('utf8')); } catch { return null; }

  if (!claims || typeof claims.exp !== 'number' || Date.now() > claims.exp) return null;

  return claims;
}

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const secret = process.env.GAP_CHECK_TOKEN_SECRET;
  if (!secret) {
    return res.status(503).send('Download service is not configured.');
  }

  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).send('Missing token. Use the form on the home page to receive your download link.');
  }

  const claims = verifyToken(token, secret);
  if (!claims) {
    return res.status(403).send('This download link has expired or is invalid. Please submit the form again to get a new one.');
  }

  let pdf;
  try {
    pdf = readFileSync(PDF_PATH);
  } catch {
    console.error('[gap-check-download] PDF not found at', PDF_PATH);
    return res.status(500).send('The file is temporarily unavailable. Please email us and we will send it directly.');
  }

  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="${PDF_NAME}"`);
  res.setHeader('content-length', pdf.length);
  res.status(200).end(pdf);
}
