#!/usr/bin/env node
/**
 * check-deploy-surface.mjs — every file uploaded to Vercel is served publicly.
 *
 * On 2026-08-17 the production site returned 200 for /tests/test-webhook.mjs,
 * /scripts/check-secrets.mjs, /apply-chrome.py, /docs/PRIVATE-PAYHIP-FILES.md,
 * /areas/finders-book.md and /.github/workflows/validate.yml. No secret values
 * were exposed, but the webhook signature scheme, the MailerLite group ids, the
 * credential patterns being scanned for, and the internal operational runbook
 * all were. The fix is .vercelignore; this check is what keeps it fixed.
 *
 * Rule: every tracked top-level path is either something the running site needs
 * or is excluded from deployment. A new development-only directory fails here
 * rather than appearing on the marketing domain.
 *
 *   node scripts/check-deploy-surface.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Paths the served site or its functions genuinely need. */
const RUNTIME = new Set([
  'api',                             // serverless routes
  'lib',                             // imported by the routes
  'assets',                          // images and fonts
  'Family-Readiness-Gap-Check.pdf',  // read from disk by api/gap-check-download.js
  'robots.txt',
  'sitemap.xml',
  'vercel.json',
  'package.json',
  'package-lock.json',
]);

/** Root files the browser loads directly. */
const RUNTIME_EXTENSIONS = new Set(['.html', '.css', '.js']);

/** Dotfiles Vercel does not serve, and which carry nothing sensitive anyway. */
const NOT_SERVED = new Set(['.gitignore']);

const problems = [];

let ignoreText = '';
try {
  ignoreText = readFileSync('.vercelignore', 'utf8');
} catch {
  console.error('Deploy surface check failed: .vercelignore is missing.\n'
    + 'Without it, every script, test, and internal document in this repository\n'
    + 'is published on https://www.familyfindersbook.com.');
  process.exit(1);
}

const ignored = new Set(
  ignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/\/$/, ''))
);

const tracked = execFileSync('git', ['ls-tree', '--name-only', 'HEAD'], { encoding: 'utf8' })
  .split('\n')
  .map((entry) => entry.trim().replace(/\/$/, ''))
  .filter(Boolean);

for (const entry of tracked) {
  if (RUNTIME.has(entry) || NOT_SERVED.has(entry)) continue;
  const extension = entry.includes('.') ? entry.slice(entry.lastIndexOf('.')) : '';
  if (!entry.includes('/') && RUNTIME_EXTENSIONS.has(extension) && !entry.startsWith('.')) continue;
  if (ignored.has(entry)) continue;
  problems.push(`${entry} would be published at https://www.familyfindersbook.com/${entry}`
    + ' — add it to .vercelignore, or to RUNTIME in this script if the site needs it');
}

// The lead magnet URL is load-bearing (the MailerLite delivery email links
// straight to it, because a 15-minute signed token expires before most people
// open an email), so it cannot be blocked. It must still never rank: an indexed
// lead magnet is one a search result hands out without an email address.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const pdfRule = (vercel.headers ?? []).find((rule) => rule.source === '/Family-Readiness-Gap-Check.pdf');
const pdfRobots = (pdfRule?.headers ?? []).find((header) => header.key.toLowerCase() === 'x-robots-tag');
if (!pdfRobots || !/noindex/i.test(pdfRobots.value)) {
  problems.push('the Gap Check PDF has no X-Robots-Tag: noindex rule in vercel.json'
    + ' — search engines would hand out the lead magnet without an email address');
}

if (problems.length) {
  console.error('Deploy surface check failed:\n' + problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
console.log(`deploy surface check passed: ${ignored.size} development paths excluded, lead magnet is noindex`);
