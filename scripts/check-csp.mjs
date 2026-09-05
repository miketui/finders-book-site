#!/usr/bin/env node
/** Ensure every executable inline script is allowed by the production CSP. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PAGES = [
  'index.html',
  'about.html',
  'order.html',
  'contact.html',
  'start.html',
  'how-it-works.html',
  'family-emergency-planning.html',
  'important-documents.html',
  'letter-of-instruction.html',
  'in-case-of-death-binder.html',
  'privacy-policy.html',
  'refund-policy.html',
  'terms.html',
  '404.html',
];

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const csp = vercel.headers
  .flatMap((entry) => entry.headers || [])
  .find((header) => header.key.toLowerCase() === 'content-security-policy')?.value || '';
const allowedHashes = new Set([...csp.matchAll(/'sha256-([^']+)'/g)].map((match) => match[1]));
const consentSource = readFileSync('consent.js', 'utf8');

let failed = false;
const fail = (message) => { failed = true; console.error(`  FAIL  ${message}`); };
const ok = (message) => console.log(`  ok    ${message}`);

console.log('\ncontent security policy');

if (!/(?:^|;)\s*frame-ancestors\s+'self'\s*(?:;|$)/.test(csp)) {
  fail("production CSP must enforce frame-ancestors 'self'");
}
if (!/\bscript-src\b[^;]*https:\/\/payhip\.com/.test(csp)) {
  fail('production CSP must allow https://payhip.com in script-src for overlay checkout');
}
if (!/\bframe-src\b[^;]*https:\/\/payhip\.com/.test(csp)) {
  fail('production CSP must allow https://payhip.com in frame-src for overlay checkout');
}
if (!consentSource.includes('G-ZXX0M4VYT5') ||
    !consentSource.includes('/_vercel/insights/script.js')) {
  fail('consent.js must own both optional analytics loaders');
}

for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type=["']application\/ld\+json["']/i.test(match[1]));

  for (const [, , source] of inline) {
    const hash = createHash('sha256').update(source).digest('base64');
    if (!allowedHashes.has(hash)) fail(`${page} has an inline script missing from script-src: sha256-${hash}`);
  }

  const consentIndex = html.search(/src=["']\/?consent\.js["']/);
  const analyticsIndex = html.search(/src=["']\/?analytics\.js["']/);
  if (consentIndex === -1 || analyticsIndex === -1 || consentIndex > analyticsIndex) {
    fail(`${page} must load consent.js before analytics.js`);
  }
  if (!/href=["']\/?consent\.css["']/.test(html)) {
    fail(`${page} is missing consent.css`);
  }
  if (html.includes('googletagmanager.com/gtag/js') || html.includes('/_vercel/insights/script.js')) {
    fail(`${page} loads optional analytics before consent`);
  }
  if (!failed) ok(`${page} inline scripts and consent-gated telemetry are CSP-compatible`);
}

if (failed) {
  console.error('\ncontent security policy check FAILED\n');
  process.exit(1);
}
console.log('\ncontent security policy check passed\n');
