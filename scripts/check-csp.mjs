#!/usr/bin/env node
/** Ensure every executable inline script is allowed by the production CSP. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PAGES = [
  'index.html',
  'about.html',
  'order.html',
  'contact.html',
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

let failed = false;
const fail = (message) => { failed = true; console.error(`  FAIL  ${message}`); };
const ok = (message) => console.log(`  ok    ${message}`);

console.log('\ncontent security policy');

for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type=["']application\/ld\+json["']/i.test(match[1]));

  for (const [, , source] of inline) {
    const hash = createHash('sha256').update(source).digest('base64');
    if (!allowedHashes.has(hash)) fail(`${page} has an inline script missing from script-src: sha256-${hash}`);
  }

  if (!html.includes('https://www.googletagmanager.com/gtag/js?id=G-ZXX0M4VYT5')) {
    fail(`${page} is missing the GA4 loader`);
  }
  if (!html.includes('/_vercel/insights/script.js')) {
    fail(`${page} is missing Vercel Web Analytics`);
  }
  if (!failed) ok(`${page} inline scripts and telemetry are CSP-compatible`);
}

if (failed) {
  console.error('\ncontent security policy check FAILED\n');
  process.exit(1);
}
console.log('\ncontent security policy check passed\n');
