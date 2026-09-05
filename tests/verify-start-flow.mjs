/** End-to-end /start wizard + homepage fridge + checkout decoration. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VERIFY_PORT || 8125);
const HOME_FRIDGE = 'Fridge card and the other implementation tools ship with Ultimate and Family Bundle — not Essentials.';
const START_FRIDGE = 'Fridge card is included with Ultimate and Family Bundle. Essentials buyers: use page 2 as your posted snapshot until you upgrade.';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = await new Promise((resolve) => {
  const s = createServer((req, res) => {
    let f = decodeURIComponent(req.url.split('?')[0]);
    if (f === '/') f = '/index.html';
    if (f === '/start') f = '/start.html';
    const p = join(ROOT, f);
    if (p.startsWith(ROOT) && existsSync(p) && statSync(p).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(readFileSync(p));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  s.listen(PORT, () => resolve(s));
});

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}
);
let failed = 0;
function ok(msg) { console.log(`  ok    ${msg}`); }
function fail(msg) { console.log(`  FAIL  ${msg}`); failed++; }

async function run(name, width, fn) {
  console.log(`\n${name} @ ${width}px`);
  const context = await browser.newContext({ viewport: { width, height: 844 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await context.newPage();
  try { await fn(page); } finally { await context.close(); }
}

await run('homepage fridge + overlay decorate', 390, async (page) => {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  const note = await page.locator('.compare-note').innerText();
  if (note.includes(HOME_FRIDGE)) ok('comparison table has exact fridge sentence');
  else fail(`fridge note was: ${note}`);
  const href = await page.locator('[data-checkout][data-placement="hero"]').getAttribute('href');
  const product = await page.locator('[data-checkout][data-placement="hero"]').getAttribute('data-product');
  if (href && /payhip\.com\/buy\?.*link=Y1O7B/.test(href)) ok('hero CTA uses /buy?link=Y1O7B fallback');
  else fail(`hero href ${href}`);
  if (product === 'Y1O7B') ok('hero CTA carries data-product=Y1O7B');
  else fail(`hero data-product ${product}`);
  const sublines = await page.locator('.checkout-subline').allInnerTexts();
  if (sublines.length === 3 && sublines.every((t) => t.includes('Instant download · One-time · No account required'))) {
    ok('three pricing cards show the locked checkout subline');
  } else fail(`checkout sublines: ${JSON.stringify(sublines)}`);
  const guarantees = await page.locator('#pricing .cta-guarantee').count();
  if (guarantees >= 3) ok('30-day guarantee sits under all three checkout buttons');
  else fail(`pricing guarantees ${guarantees}`);
});

await run('start wizard one step at a time', 390, async (page) => {
  await page.goto(`http://localhost:${PORT}/start`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  const visible = async (sel) => page.locator(sel).evaluate((el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && !el.hidden;
  });
  if (await visible('[data-start-step="1"]') && !(await visible('[data-start-step="2"]'))) {
    ok('mobile first paint shows only step 1');
  } else fail('step 1/2 visibility on load');
  await page.locator('[data-start-next]').click();
  await page.waitForTimeout(200);
  if (await visible('[data-start-step="2"]') && !(await visible('[data-start-step="1"]'))) {
    ok('Next reveals fridge step only');
  } else fail('step 2 after Next');
  const fridge = await page.locator('[data-start-step="2"]').innerText();
  if (fridge.includes(START_FRIDGE)) ok('step 2 uses Marketing fridge sentence');
  else fail('step 2 missing fridge sentence');
  await page.locator('[data-start-goto="5"]').click();
  await page.waitForTimeout(200);
  if (await visible('[data-start-step="5"]')) ok('step 5 handoff is reachable');
  else fail('step 5 not visible');
  await page.locator('[data-copy]').click();
  await page.waitForTimeout(200);
  const status = await page.locator('#handoffCopyStatus').innerText();
  if (/Copied|copy it yourself/i.test(status)) ok(`copy button reported: ${status}`);
  else fail(`copy status empty: "${status}"`);
  const support = await page.locator('#start-support').innerText();
  if (support.includes('A person answers within 3 business days') && support.includes('info@familyfindersbook.com')) {
    ok('support promise and inbox are visible');
  } else fail('support block missing');
});

await browser.close();
server.close();
if (failed) {
  console.error(`\nverify-start-flow FAILED (${failed})\n`);
  process.exit(1);
}
console.log('\nverify-start-flow passed\n');
