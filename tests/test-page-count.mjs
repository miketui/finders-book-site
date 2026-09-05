/** Public page-count honesty: Ultimate ships 250; Essentials extract is 001–049. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const pages = readdirSync('.').filter((name) => name.endsWith('.html'));
const analytics = readFileSync('analytics.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
const order = readFileSync('order.html', 'utf8');
const start = readFileSync('start.html', 'utf8');
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

const E1 = 'Start here: pages 001–049 for the first hours — who to call, where records live. Fillable + print.';
const E_BULLET = '49-page first-hours organizer (pages 001–049): fillable PDF + print PDF';
const E_ALT = "The Finder's Book Essentials edition: the 49-page first-hours fillable and printable starter (pages 001–049).";
const E_UPGRADE = 'Upgrade to Ultimate for the full 250-page system + five implementation tools.';

const ESSENTIALS_ALLOWED = [E1, E_BULLET, E_ALT, E_UPGRADE];

const FULL_FILE_FORBIDDEN = [
  /forty-nine/i,
  /see all 49/i,
  /all 49 pages/i,
  /49 fillable/i,
  /49 sequential/i,
  /49-page start path/i,
  /same 49 pages/i,
  /49-page fillable and printable family emergency/i,
  /49-page organizer: fillable PDF \+ print PDF/,
  /49 pages · Ultimate/i,
];

function withoutEssentialsLock(text) {
  let next = text;
  for (const allowed of ESSENTIALS_ALLOWED) next = next.split(allowed).join('');
  return next;
}

console.log('\n=== Page-count honesty ===\n');

check('public HTML does not claim the full shipping file is 49 pages', () => {
  const hits = [];
  for (const page of pages) {
    const text = withoutEssentialsLock(readFileSync(page, 'utf8'));
    for (const re of FULL_FILE_FORBIDDEN) {
      if (re.test(text)) hits.push(`${page} matches ${re}`);
    }
    if (/49-page(?! first-hours)/i.test(text) && !/001–049/.test(text)) {
      /* leftover generic 49-page claims after stripping locked Essentials lines */
      if (/49-page/.test(text)) hits.push(`${page} still has generic 49-page copy`);
    }
  }
  assert.deepEqual(hits, []);
});

check('Ultimate public line uses 250-page honesty', () => {
  assert.match(index, /A 250-page Family Clarity System™ — start with four decisions in 15 minutes\./);
  assert.match(index, /Ultimate \$49 · 250 pages · Instant download · One-time/);
  assert.match(index, /250 pages · Ultimate Digital Edition/);
  assert.match(index, /250 sequential pages/);
  assert.match(index, /250 pages and many fields are heavy on phones/);
  assert.match(index, /The Family Clarity System™: a 250-page family emergency and legacy organizer by Michael David\./);
  assert.match(index, /the 250-page binder plus the five implementation tools/);
  assert.match(index, /Do I have to complete all 250 pages for it to help\?/);
});

check('$49 Ultimate price strings are preserved', () => {
  assert.match(index, /data-price="49"/);
  assert.match(index, /Get the Ultimate System: \$49/);
  assert.match(index, /product:price:amount" content="49\.00"/);
});

check('Essentials uses locked first-hours 001–049 copy', () => {
  for (const page of [index, order]) {
    assert.ok(page.includes(E1));
    assert.ok(page.includes(E_BULLET));
    assert.ok(page.includes(E_ALT));
    assert.ok(page.includes(E_UPGRADE));
  }
});

check('gallery does not claim we show all 250 scans', () => {
  assert.match(index, /See the page previews/);
  assert.doesNotMatch(index, /see all 250/i);
  assert.match(index, /PAGE PREVIEWS OVERLAY/);
});

check('overlay titles include Family Clarity System™', () => {
  assert.match(analytics, /The Finder's Book — Essentials · The Family Clarity System™/);
  assert.match(analytics, /The Finder's Book — Ultimate · The Family Clarity System™/);
  assert.match(analytics, /The Finder's Book — Family Bundle · The Family Clarity System™/);
});

check('/start has no full-file 49-page claims and uses Marketing lock', () => {
  assert.match(start, />Start tonight</);
  assert.match(start, /Copy message/);
  assert.match(start, /Point to where passwords live/);
  const text = withoutEssentialsLock(start);
  for (const re of FULL_FILE_FORBIDDEN) {
    assert.doesNotMatch(text, re);
  }
});

check('gold-tree sell cover is unchanged', () => {
  assert.match(index, /assets\/finders-book-cover-800\.webp/);
  assert.doesNotMatch(index + order, /Direction A|continuity-cover|sell-cover-a/i);
});

check('product rasters no longer ship the old 49-PAGES hashes', () => {
  const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.notEqual(sha('assets/ultimate-product-800.webp'), '74897c34f07dd9391294822d92842fe0771f53776824da6d8228c103a5ec6c0b');
  assert.notEqual(sha('assets/essentials-product-800.webp'), '19473cf966e76a4977fe7ac6837a51da6a04ed5b99c4b23ecbd039baa53a6c4b');
});

console.log(`\n${'='.repeat(46)}\n  ${pass} passed\n${'='.repeat(46)}\n`);
