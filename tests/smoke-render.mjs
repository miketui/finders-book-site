#!/usr/bin/env node
/**
 * smoke-render.mjs — the test that would have caught the GSAP regression.
 *
 * check-chrome-drift.mjs compares MARKUP. It cannot see that an element is
 * present, correct, and invisible. On 2026-08-01 a GSAP rewrite added an
 * early `return` to motion.js that silently killed every reveal on
 * about/order/contact -- no console error, no 404, no markup change. The
 * hero headline, subhead and product image on the order page all rendered
 * at opacity 0 in production.
 *
 * This test renders each page in a real headless browser and asserts:
 *   1. Above-the-fold content is actually VISIBLE (opacity > 0.9)
 *   2. No uncaught JS errors
 *   3. No 4xx/5xx on same-origin requests
 *   4. Cumulative Layout Shift stays under budget
 *
 * It runs against a local static server by default, so it gates PRs before
 * a bad build can reach production.
 *
 *   node tests/smoke-render.mjs                     # local, all pages
 *   BASE_URL=https://example.com node tests/...     # against a deploy
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT || 8123);
const EXTERNAL = process.env.BASE_URL || '';
const CLS_BUDGET = 0.05;

/** Pages, and the selectors that MUST be visible on each. */
const PAGES = [
  { path: '/',             must: ['h1', '.lede'] },
  { path: '/about.html',   must: ['h1', '.lede', '.eyebrow'] },
  { path: '/order.html',   must: ['h1', '.lede', '.eyebrow', '.book3d', '.tier'] },
  { path: '/contact.html', must: ['h1', '.lede', '.eyebrow', '.cf-radio'] },
  { path: '/missing/nested-route', must: ['h1', '.lede', '.eyebrow', '.nav-toggle'] },
  { path: '/terms.html',   must: ['h1', '.lede', '.eyebrow'] },
];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

/**
 * Vercel injects Analytics at the edge; it is absent in local static serving.
 */
const OPTIONAL_404 = [
  '/_vercel/insights/script.js',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf',
  '.glb': 'model/gltf-binary',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let f = decodeURIComponent(req.url.split('?')[0]);
      if (f === '/') f = '/index.html';
      const p = join(ROOT, f);
      if (p.startsWith(ROOT) && existsSync(p) && statSync(p).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
        res.end(readFileSync(p));
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(readFileSync(join(ROOT, '404.html')));
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('\nsmoke-render: playwright is not installed.');
  console.error('  npm i -D playwright && npx playwright install --with-deps chromium\n');
  process.exit(1);
}

const server = EXTERNAL ? null : await startServer();
const BASE = EXTERNAL || `http://localhost:${PORT}`;

console.log(`\nsmoke-render  ->  ${BASE}\n`);

const browser = await chromium.launch();
let failures = 0;

for (const viewport of VIEWPORTS) {
for (const { path, must } of PAGES) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    // CI sandboxes and corporate proxies commonly re-sign TLS; this test is
    // about rendering, not certificate validation.
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  const jsErrors = [];
  const httpErrors = [];
  const optional404 = [];
  page.on('pageerror', (e) => jsErrors.push(String(e)));
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() < 400 || !u.startsWith(BASE)) return;
    const rel = u.slice(BASE.length).split('?')[0];
    if (r.status() === 404 && rel === path && path === '/missing/nested-route') return;
    if (OPTIONAL_404.includes(rel)) {
      optional404.push(rel);
      return;
    }
    httpErrors.push(`${r.status()} ${u}`);
  });

  await page.addInitScript(() => {
    window.__cls = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });

  console.log(`  ${viewport.name.padEnd(7)} ${path}`);
  try {
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 });
  } catch (e) {
    console.log(`    FAIL  navigation: ${e.message.split('\n')[0]}`);
    failures++;
    await context.close();
    continue;
  }

  // let reveal observers and any animation settle
  await page.waitForTimeout(1500);

  // --- 1. visibility ---
  for (const sel of must) {
    const result = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      return {
        found: true,
        opacity: parseFloat(cs.opacity),
        visibility: cs.visibility,
        display: cs.display,
        text: (el.textContent || '').trim().slice(0, 45),
      };
    }, sel);

    if (!result.found) {
      console.log(`    FAIL  ${sel} — not present in DOM`);
      failures++;
    } else if (result.opacity <= 0.9 || result.visibility === 'hidden' || result.display === 'none') {
      console.log(`    FAIL  ${sel} — INVISIBLE (opacity=${result.opacity}, ` +
                  `visibility=${result.visibility}) "${result.text}"`);
      failures++;
    } else {
      console.log(`    ok    ${sel} visible "${result.text}"`);
    }
  }

  // --- 2. JS errors ---
  if (jsErrors.length) {
    jsErrors.forEach((e) => console.log(`    FAIL  uncaught JS error: ${e.split('\n')[0]}`));
    failures += jsErrors.length;
  } else {
    console.log('    ok    no uncaught JS errors');
  }

  // --- 3. same-origin HTTP errors ---
  if (httpErrors.length) {
    httpErrors.forEach((e) => console.log(`    FAIL  ${e}`));
    failures += httpErrors.length;
  } else {
    console.log('    ok    no unexpected same-origin 4xx/5xx');
  }
  if (optional404.length) {
    [...new Set(optional404)].forEach((e) =>
      console.log(`    note  ${e} missing (allowlisted, progressive enhancement)`));
  }

  // --- 4. layout stability ---
  const cls = await page.evaluate(() => window.__cls).catch(() => null);
  if (typeof cls === 'number' && cls > CLS_BUDGET) {
    console.log(`    FAIL  CLS ${cls.toFixed(4)} exceeds budget ${CLS_BUDGET}`);
    failures++;
  } else if (typeof cls === 'number') {
    console.log(`    ok    CLS ${cls.toFixed(4)}`);
  }

  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)
  );
  if (overflow > 1) {
    console.log(`    FAIL  horizontal overflow ${overflow}px`);
    failures++;
  } else {
    console.log('    ok    no horizontal overflow');
  }

  await context.close();
}
}

// --- 5. mobile navigation opens, exposes links, and closes with Escape ---
console.log('\n  mobile navigation');
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  const toggle = page.locator('.nav-toggle');
  const box = await toggle.boundingBox();
  if (!box || box.width < 44 || box.height < 44) {
    console.log(`    FAIL  nav toggle touch target is ${box ? `${box.width}x${box.height}` : 'missing'}`);
    failures++;
  } else {
    console.log(`    ok    nav toggle touch target ${box.width}x${box.height}`);
  }
  await toggle.click();
  const navOpen = await page.locator('#sitenav').isVisible();
  const expanded = await toggle.getAttribute('aria-expanded');
  if (!navOpen || expanded !== 'true') {
    console.log(`    FAIL  mobile navigation did not open (visible=${navOpen}, expanded=${expanded})`);
    failures++;
  } else {
    console.log('    ok    mobile navigation opens with aria-expanded=true');
  }
  await page.keyboard.press('Escape');
  await page.locator('#sitenav').waitFor({ state: 'hidden', timeout: 1500 }).catch(() => {});
  const expandedAfter = await toggle.getAttribute('aria-expanded');
  const navVisibleAfter = await page.locator('#sitenav').isVisible();
  if (expandedAfter !== 'false' || navVisibleAfter) {
    console.log(`    FAIL  Escape did not close mobile navigation (visible=${navVisibleAfter}, expanded=${expandedAfter})`);
    failures++;
  } else {
    console.log('    ok    Escape hides mobile navigation with aria-expanded=false');
  }
  await context.close();
}

// --- 6. optional analytics is blocked until explicit consent ---
console.log('\n  analytics consent');
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const providerRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('googletagmanager.com/gtag/js') || url.includes('/_vercel/insights/script.js')) {
      providerRequests.push(url);
    }
  });
  await page.route('https://www.googletagmanager.com/**', (route) => route.abort());
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(200);

  const bannerVisible = await page.locator('.consent-banner').isVisible();
  if (!bannerVisible || providerRequests.length) {
    console.log(`    FAIL  initial consent state (banner=${bannerVisible}, provider requests=${providerRequests.length})`);
    failures++;
  } else {
    console.log('    ok    no analytics provider request before a choice');
  }

  await page.locator('.consent-allow').click();
  await page.waitForTimeout(200);
  const allowed = await page.evaluate(() => localStorage.getItem('fb_analytics_consent_v1'));
  if (allowed !== 'granted' || providerRequests.length !== 2) {
    console.log(`    FAIL  allow choice (stored=${allowed}, provider requests=${providerRequests.length})`);
    failures++;
  } else {
    console.log('    ok    explicit allow loads GA4 and Vercel Analytics once');
  }

  await page.locator('.consent-reopen').click();
  await page.locator('.consent-decline').click();
  const withdrawn = await page.evaluate(() => {
    const before = (window.dataLayer || []).length;
    window.fbTrack('event_after_withdrawal');
    return {
      stored: localStorage.getItem('fb_analytics_consent_v1'),
      disabled: window['ga-disable-G-ZXX0M4VYT5'],
      before,
      after: (window.dataLayer || []).length,
    };
  });
  if (withdrawn.stored !== 'denied' || withdrawn.disabled !== true || withdrawn.after !== withdrawn.before) {
    console.log(`    FAIL  withdrawal did not stop site events (${JSON.stringify(withdrawn)})`);
    failures++;
  } else {
    console.log('    ok    withdrawal disables GA and drops future site events');
  }
  await context.close();
}

// --- 7. the specific regression: sub-pages must survive without GSAP ---
console.log('\n  no-GSAP resilience (blocks the CDN, simulates failure)');
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  await context.route('**/cdn.jsdelivr.net/**', (route) => route.abort());
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const heroOpacity = await page.evaluate(() => {
    const h = document.querySelector('h1');
    return h ? parseFloat(getComputedStyle(h).opacity) : -1;
  });

  if (heroOpacity <= 0.9) {
    console.log(`    FAIL  home h1 invisible (opacity=${heroOpacity}) when the CDN is unavailable`);
    failures++;
  } else {
    console.log(`    ok    home h1 still visible (opacity=${heroOpacity}) with the CDN blocked`);
  }
  if (errs.length) {
    errs.forEach((e) => console.log(`    FAIL  JS error with CDN blocked: ${e.split('\n')[0]}`));
    failures += errs.length;
  } else {
    console.log('    ok    no JS errors with the CDN blocked');
  }
  await context.close();
}

await browser.close();
if (server) server.close();

console.log('');
if (failures) {
  console.error(`smoke-render FAILED — ${failures} problem(s)\n`);
  process.exit(1);
}
console.log('smoke-render passed\n');
