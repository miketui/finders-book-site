/** Payhip overlay helpers and product-slug guards. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const analytics = readFileSync('analytics.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
const start = readFileSync('start.html', 'utf8');
const overlayDoc = readFileSync('docs/PAYHIP-OVERLAY.md', 'utf8');
let pass = 0;

function check(name, fn) {
  try {
    fn();
    pass++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

function bootCheckout(hrefs) {
  const links = hrefs.map((href, i) => {
    const attrs = {
      href,
      'data-checkout': '',
      'data-tier': href.includes('eHcPG') ? 'essentials' : href.includes('xPuv4') ? 'family_bundle' : 'ultimate',
      'data-price': href.includes('eHcPG') ? '29' : href.includes('xPuv4') ? '89' : '49',
      'data-placement': 'test-' + i,
    };
    const el = {
      attrs,
      getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
      setAttribute(name, value) { attrs[name] = String(value); },
      hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
      addEventListener() {},
      get href() { return attrs.href; },
      set href(value) { attrs.href = value; },
    };
    return el;
  });
  const created = [];
  const document = {
    querySelectorAll(sel) { return sel === '[data-checkout]' ? links : []; },
    getElementById() { return null; },
    createElement(tag) {
      const node = { tagName: tag, src: '', async: false, onload: null, onerror: null, textContent: '', id: '' };
      created.push(node);
      return node;
    },
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    addEventListener() {},
  };
  const window = {
    fbAnalyticsConsent: 'denied',
    addEventListener() {},
    dispatchEvent() {},
    Payhip: {
      Checkout: { open(options) { window.__opened = true; window.__overlayOptions = options; } },
    },
    location: { origin: 'https://www.familyfindersbook.com', pathname: '/', hostname: 'www.familyfindersbook.com' },
    va() {},
    gtag() {},
  };
  const location = window.location;
  runInNewContext(analytics, { window, document, location, sessionStorage: { getItem() { return '{}'; }, setItem() {} }, URL, URLSearchParams, Object, Array, Number, String });
  return { window, links, created };
}

console.log('\n=== Payhip overlay checkout ===\n');

check('live slugs stay eHcPG / Y1O7B / xPuv4', () => {
  assert.match(analytics, /essentials:\s*"eHcPG"/);
  assert.match(analytics, /ultimate:\s*"Y1O7B"/);
  assert.match(analytics, /family_bundle:\s*"xPuv4"/);
  assert.match(index, /payhip\.com\/b\/eHcPG/);
  assert.match(index, /payhip\.com\/b\/Y1O7B/);
  assert.match(index, /payhip\.com\/b\/xPuv4/);
  assert.doesNotMatch(analytics + index, /payhip\.com\/b\/Y107B/);
});

check('overlay prefers in-page checkout and keeps /buy fallback', () => {
  assert.match(analytics, /payhip\.com\/payhip\.js/);
  assert.match(analytics, /Payhip\.Checkout\.open/);
  assert.match(analytics, /url\.pathname = "\/buy"/);
  assert.match(analytics, /e\.preventDefault\(\)/);
  assert.match(analytics, /brandedStartUrl/);
  assert.match(analytics, /start\.html/);
  assert.match(analytics, /readyState === "complete"/);
  assert.match(analytics, /addEventListener\("load", scheduleIdlePayhip\)/);
});

check('product-key helper reads /b/ and /buy?link=', () => {
  const { window } = bootCheckout(['https://payhip.com/b/Y1O7B']);
  assert.equal(window.fbPayhip.productKeyFromHref('https://payhip.com/b/eHcPG'), 'eHcPG');
  assert.equal(window.fbPayhip.productKeyFromHref('https://payhip.com/buy?link=xPuv4'), 'xPuv4');
  assert.equal(window.fbPayhip.slugs.ultimate, 'Y1O7B');
  assert.equal(window.fbPayhip.startPath, '/start.html');
});

check('overlay open is used when Payhip.Checkout is present', () => {
  const { window, links } = bootCheckout(['https://payhip.com/b/Y1O7B']);
  assert.equal(window.fbPayhip.openOverlay(links[0]), true);
  assert.equal(window.__opened, true);
});

check('overlay passes locked titles and /start return', () => {
  const { window, links } = bootCheckout([
    'https://payhip.com/b/eHcPG',
    'https://payhip.com/b/Y1O7B',
    'https://payhip.com/b/xPuv4',
  ]);
  assert.equal(window.fbPayhip.titles.eHcPG, "The Finder's Book — Essentials · The Family Clarity System™");
  assert.equal(window.fbPayhip.titles.Y1O7B, "The Finder's Book — Ultimate · The Family Clarity System™");
  assert.equal(window.fbPayhip.titles.xPuv4, "The Finder's Book — Family Bundle · The Family Clarity System™");
  assert.equal(window.fbPayhip.checkoutSubline, 'Instant download · One-time · No account required');
  assert.equal(window.fbPayhip.overlayTitleFor('Y1O7B'), "The Finder's Book — Ultimate · The Family Clarity System™");
  assert.equal(window.fbPayhip.openOverlay(links[1]), true);
  assert.equal(window.__overlayOptions.product, 'Y1O7B');
  assert.equal(window.__overlayOptions.title, "The Finder's Book — Ultimate · The Family Clarity System™");
  assert.match(window.__overlayOptions.successUrl, /\/start\.html$/);
});

check('pricing cards carry the locked subline and 30-day trust strip', () => {
  assert.equal(index.split('Instant download · One-time · No account required').length - 1, 3);
  assert.match(index, /email us within 30 days and we’ll make it right/);
  const order = readFileSync('order.html', 'utf8');
  assert.equal(order.split('Instant download · One-time · No account required').length - 1, 3);
  assert.match(order, /email us within 30 days and we’ll make it right/);
});

check('sale chrome is suppressed from our document when possible', () => {
  assert.match(analytics, /fb-payhip-sale-hide/);
  assert.match(analytics, /payhip-sale-badge/);
});

check('owner docs do not claim Payhip admin was changed', () => {
  assert.match(overlayDoc, /APPROVAL NEEDED/);
  assert.match(overlayDoc, /Account.*Settings.*Advanced Settings/i);
  assert.match(overlayDoc, /https:\/\/www\.familyfindersbook\.com\/start\.html/);
  assert.doesNotMatch(overlayDoc, /we (?:have )?changed the Payhip dashboard/i);
});

check('start page is not a hard upsell and names the support promise', () => {
  assert.match(start, /A person answers within 3 business days/);
  assert.match(start, /info@familyfindersbook\.com/);
  assert.match(start, /pointer, not a vault/);
  assert.match(start, /Michael David/);
  assert.doesNotMatch(start, /aggregateRating|★★★★★|5-star|verified buyer/i);
});

console.log(`\n${'='.repeat(46)}\n  ${pass} passed\n${'='.repeat(46)}\n`);
