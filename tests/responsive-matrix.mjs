#!/usr/bin/env node
/**
 * Launch responsive matrix.
 *
 * Complements smoke-render.mjs by exercising every width in the final launch
 * brief, including the historical ~360px interaction regression. It focuses
 * on the three revenue/support surfaces where clipping or hit-area failures
 * are most expensive: home, order, and contact.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.RESPONSIVE_PORT || 8124);
const EXTERNAL = process.env.BASE_URL || '';

const WIDTHS = [320, 360, 375, 390, 412, 430, 768, 1024, 1280];
const PAGES = [
  {
    path: '/',
    controls: [
      { selector: '#callSkip', min: 0, label: 'Skip Intro' },
      { selector: '.hero .btn-row .btn-primary', min: 44, label: 'hero checkout CTA' },
      { selector: '.hero .btn-row .btn-ghost', min: 44, label: 'hero preview CTA' },
    ],
  },
  {
    path: '/order.html',
    controls: [
      { selector: '[data-checkout][data-placement="order-essentials"]', min: 44, label: 'Essentials CTA' },
      { selector: '[data-checkout][data-placement="order-ultimate"]', min: 44, label: 'Ultimate CTA' },
      { selector: '[data-checkout][data-placement="order-bundle"]', min: 44, label: 'Family CTA' },
    ],
  },
  {
    path: '/contact.html',
    controls: [
      { selector: '#cfSubmit', min: 44, label: 'contact submit' },
    ],
  },
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf',
  '.glb': 'model/gltf-binary',
};

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let f = decodeURIComponent(req.url.split('?')[0]);
      if (req.method === 'POST' && f === '/api/contact') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
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
  console.error('responsive-matrix: playwright is not installed');
  process.exit(1);
}

const server = EXTERNAL ? null : await startServer();
const BASE = EXTERNAL || `http://localhost:${PORT}`;
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}
);

let failures = 0;
console.log(`\nresponsive-matrix -> ${BASE}\n`);

async function visible(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0 && r.height > 0;
  }).catch(() => false);
}

async function checkControl(page, width, { selector, min, label }) {
  const matches = page.locator(selector);
  const count = await matches.count();
  if (!count) {
    console.log(`    FAIL  ${label}: selector missing (${selector})`);
    failures++;
    return;
  }

  let target = null;
  for (let i = 0; i < count; i++) {
    const candidate = matches.nth(i);
    if (await visible(candidate)) { target = candidate; break; }
  }
  if (!target) {
    console.log(`    FAIL  ${label}: no visible match`);
    failures++;
    return;
  }

  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  const result = await target.evaluate((el, args) => {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
    const hit = document.elementFromPoint(x, y);
    return {
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      inHorizontalViewport: r.left >= -1 && r.right <= args.width + 1,
      hitSelf: Boolean(hit && (hit === el || el.contains(hit))),
      hit: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}.${String(hit.className || '').replace(/\s+/g,'.')}` : 'nothing',
    };
  }, { width });

  if (!result.inHorizontalViewport) {
    console.log(`    FAIL  ${label}: clipped horizontally left=${result.left.toFixed(1)} right=${result.right.toFixed(1)}`);
    failures++;
  } else if (!result.hitSelf) {
    console.log(`    FAIL  ${label}: centre hit intercepted by ${result.hit}`);
    failures++;
  } else if (min && result.height < min) {
    console.log(`    FAIL  ${label}: touch height ${result.height.toFixed(1)}px < ${min}px`);
    failures++;
  } else {
    console.log(`    ok    ${label}: ${Math.round(result.width)}x${Math.round(result.height)} hit-safe`);
  }
}

async function checkNavigation(page, width) {
  // Header stays visible on scroll-down (Get Ultimate must remain reachable).
  // Test navigation from the top of the page before downstream CTAs are exercised.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);

  const toggle = page.locator('.nav-toggle');
  const drawerMode = await toggle.isVisible();

  if (width <= 720) {
    if (!drawerMode) {
      console.log('    FAIL  mobile nav toggle missing at drawer breakpoint');
      failures++;
      return;
    }
    const box = await toggle.boundingBox();
    if (!box || box.width < 44 || box.height < 44) {
      console.log(`    FAIL  mobile nav target ${box ? `${box.width}x${box.height}` : 'missing'}`);
      failures++;
      return;
    }
    const hit = await toggle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(t && (t === el || el.contains(t)));
    });
    if (!hit) {
      console.log('    FAIL  mobile nav centre is intercepted');
      failures++;
      return;
    }
    await toggle.click();
    const open = await page.locator('#sitenav').isVisible();
    const expanded = await toggle.getAttribute('aria-expanded');
    if (!open || expanded !== 'true') {
      console.log(`    FAIL  mobile nav did not open (visible=${open}, expanded=${expanded})`);
      failures++;
    } else {
      console.log(`    ok    mobile nav ${Math.round(box.width)}x${Math.round(box.height)} opens`);
    }
    await page.keyboard.press('Escape');
    return;
  }

  if (drawerMode) {
    console.log('    FAIL  drawer toggle visible above 720px breakpoint');
    failures++;
    return;
  }
  const desktopNav = page.locator('#sitenav');
  if (!(await desktopNav.isVisible())) {
    console.log('    FAIL  desktop navigation missing above 720px breakpoint');
    failures++;
  } else {
    console.log('    ok    desktop navigation visible');
  }
}

for (const width of WIDTHS) {
  const height = width <= 430 ? 844 : 900;
  console.log(`  viewport ${width}x${height}`);

  for (const spec of PAGES) {
    const context = await browser.newContext({ viewport: { width, height }, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const jsErrors = [];
    page.on('pageerror', (e) => jsErrors.push(String(e)));

    await page.goto(BASE + spec.path, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(400);

    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    if (overflow > 1) {
      console.log(`    FAIL  ${spec.path}: horizontal overflow ${overflow}px`);
      failures++;
    } else {
      console.log(`    ok    ${spec.path}: no horizontal overflow`);
    }

    if (spec.path === '/') await checkNavigation(page, width);

    if (jsErrors.length) {
      jsErrors.forEach((e) => console.log(`    FAIL  ${spec.path}: JS ${e.split('\n')[0]}`));
      failures += jsErrors.length;
    }

    for (const control of spec.controls) await checkControl(page, width, control);

    await context.close();
  }
}

await browser.close();
if (server) server.close();

console.log('');
if (failures) {
  console.error(`responsive-matrix FAILED — ${failures} problem(s)\n`);
  process.exit(1);
}
console.log('responsive-matrix passed\n');