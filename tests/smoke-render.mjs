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
import AxeBuilder from '@axe-core/playwright';

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
  { path: '/how-it-works.html', must: ['h1', '.lede', '.eyebrow', '.doc-list'] },
  { path: '/family-emergency-planning.html', must: ['h1', '.lede', '.eyebrow', '.ticks'] },
  { path: '/important-documents.html', must: ['h1', '.lede', '.eyebrow', '.ticks'] },
  { path: '/in-case-of-death-binder.html', must: ['h1', '.lede', '.eyebrow', '.ticks', '.doc-list'] },
  { path: '/letter-of-instruction.html', must: ['h1', '.lede', '.eyebrow', '.ticks'] },
  { path: '/privacy-policy.html', must: ['h1', '.lede', '.eyebrow'] },
  { path: '/refund-policy.html', must: ['h1', '.lede', '.eyebrow'] },
  {
    path: '/missing/nested-route',
    must: ['h1', '.lede', '.eyebrow'],
    mobileMust: ['.nav-toggle'],
  },
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

// Sandboxes that ship a pre-installed Chromium (and pin PLAYWRIGHT_BROWSERS_PATH)
// often carry a different build number than the npm package expects. CI installs
// its own browser and ignores this.
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}
);
let failures = 0;

for (const viewport of VIEWPORTS) {
for (const { path, must, mobileMust = [] } of PAGES) {
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
  const requiredSelectors = viewport.name === 'mobile' ? [...must, ...mobileMust] : must;
  for (const sel of requiredSelectors) {
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

  // --- 4. WCAG A/AA accessibility ---
  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const axeViolations = axeResults.violations.filter((violation) =>
    ['serious', 'critical'].includes(violation.impact) || violation.id === 'color-contrast'
  );
  if (axeViolations.length) {
    for (const violation of axeViolations) {
      const targets = violation.nodes.slice(0, 3).flatMap((node) => node.target).join(' | ');
      console.log(`    FAIL  axe ${violation.id} (${violation.impact || 'unknown'}): ${targets}`);
    }
    failures += axeViolations.length;
  } else {
    console.log('    ok    axe WCAG A/AA: no serious/critical or color-contrast violations');
  }

  // --- 5. layout stability ---
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

// --- 7. Skip Intro must reach the offer across input/motion modes ---
// The failure this guards against is not "the handler is wrong". On 2026-08-17
// the control was visible, enabled, and unclickable: it rendered underneath the
// fixed header wrap on desktop and under the nav toggle on mobile, so every
// click landed on the header instead. Hit-testing the control's own centre is
// what catches that; asserting the scroll position alone does not.
console.log('\n  Skip Intro');
for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
  });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(600);

  const hit = await page.evaluate(() => {
    const el = document.getElementById('callSkip');
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      found: true,
      reachable: Boolean(target && (target === el || el.contains(target))),
      blockedBy: target ? `${target.tagName.toLowerCase()}.${target.className}`.slice(0, 60) : 'nothing',
    };
  });
  if (!hit.found || !hit.reachable) {
    console.log(`    FAIL  ${viewport.name} Skip Intro is not clickable — the click lands on ${hit.blockedBy}`);
    failures++;
  } else {
    console.log(`    ok    ${viewport.name} Skip Intro receives its own clicks`);
  }

  await page.locator('#callSkip').click({ timeout: 5000 }).catch((e) => {
    console.log(`    FAIL  ${viewport.name} Skip Intro click failed: ${e.message.split('\n')[0]}`);
    failures++;
  });
  await page.waitForTimeout(1200);
  const position = await page.evaluate(() => ({
    hash: location.hash,
    y: window.scrollY,
    revealTop: document.getElementById('reveal')?.getBoundingClientRect().top,
  }));
  if (position.y < 100 || Math.abs(position.revealTop ?? 9999) > 8) {
    console.log(`    FAIL  ${viewport.name} Skip Intro did not reach #reveal (${JSON.stringify(position)})`);
    failures++;
  } else {
    console.log(`    ok    ${viewport.name} Skip Intro reaches #reveal`);
  }
  await context.close();
}

// Reduced motion collapses Act 0 to a single screen, so there is deliberately
// nothing to skip. What must hold is that the offer is reachable anyway.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => {
    const reveal = document.getElementById('reveal');
    const h1 = document.querySelector('h1');
    return {
      revealFromTop: reveal ? Math.round(reveal.getBoundingClientRect().top + window.scrollY) : null,
      h1Visible: h1 ? parseFloat(getComputedStyle(h1).opacity) > 0.9 : false,
      viewportHeight: window.innerHeight,
    };
  });
  // One screen of introduction, not four-plus viewports of forced scrolling.
  const withinOneScreen = state.revealFromTop !== null && state.revealFromTop <= state.viewportHeight * 1.5;
  if (!withinOneScreen || !state.h1Visible) {
    console.log(`    FAIL  reduced motion still gates the offer (${JSON.stringify(state)})`);
    failures++;
  } else {
    console.log(`    ok    reduced motion puts the offer within one screen (${state.revealFromTop}px)`);
  }
  await context.close();
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(BASE + '/', { waitUntil: 'load', timeout: 30000 });
  await page.locator('#callSkip').click();
  // html has scroll-behavior:smooth, so the jump is animated even without JS.
  await page.waitForTimeout(800);
  const position = await page.evaluate(() => ({ hash: location.hash, y: window.scrollY }));
  if (position.hash !== '#reveal' || position.y < 100) {
    console.log(`    FAIL  no-JS Skip Intro fallback failed (${JSON.stringify(position)})`);
    failures++;
  } else {
    console.log('    ok    no-JS Skip Intro anchor fallback reaches #reveal');
  }
  await context.close();
}

// --- 8. the specific regression: sub-pages must survive without GSAP ---
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

// --- 9. weight budgets ---
// Page weight only ever grows by accident. These ceilings sit roughly 25% above
// the measured cost of the current design, so an added library or an unoptimised
// image trips the build instead of quietly costing LCP on a phone.
// Sizes are uncompressed bytes; production serves these gzipped/brotli'd.
console.log('\n  weight budgets (uncompressed)');
{
  const BUDGET_KB = { js: 240, css: 110, font: 200, img: 500 };
  const DOM_BUDGET = 1500;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  for (const path of ['/', '/order.html', '/contact.html']) {
    const page = await context.newPage();
    await page.goto(BASE + path, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1200);
    const measured = await page.evaluate(() => {
      const bytes = { js: 0, css: 0, font: 0, img: 0 };
      for (const entry of performance.getEntriesByType('resource')) {
        const ext = (entry.name.split('?')[0].split('.').pop() || '').toLowerCase();
        const kind = ext === 'js' ? 'js'
          : ext === 'css' ? 'css'
          : ext === 'woff2' ? 'font'
          : ['webp', 'jpg', 'jpeg', 'png', 'svg', 'avif'].includes(ext) ? 'img'
          : null;
        if (kind) bytes[kind] += entry.encodedBodySize || entry.transferSize || 0;
      }
      return { bytes, dom: document.getElementsByTagName('*').length };
    });
    const over = Object.entries(BUDGET_KB)
      .filter(([kind, kb]) => measured.bytes[kind] / 1024 > kb)
      .map(([kind, kb]) => `${kind} ${(measured.bytes[kind] / 1024).toFixed(0)}KB > ${kb}KB`);
    if (measured.dom > DOM_BUDGET) over.push(`DOM ${measured.dom} nodes > ${DOM_BUDGET}`);
    const summary = Object.entries(measured.bytes)
      .map(([kind, value]) => `${kind} ${(value / 1024).toFixed(0)}KB`).join(', ');
    if (over.length) {
      console.log(`    FAIL  ${path} over budget: ${over.join('; ')}`);
      failures++;
    } else {
      console.log(`    ok    ${path} ${summary}, DOM ${measured.dom}`);
    }
    await page.close();
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
