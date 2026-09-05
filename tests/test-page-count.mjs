/** Public page-count honesty: shipping file is 250 pages. $49 prices stay. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const pages = readdirSync('.').filter((name) => name.endsWith('.html'));
const analytics = readFileSync('analytics.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
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

const FORBIDDEN = [
  /49-page/i,
  /49 pages/i,
  /forty-nine/i,
  /see all 49/i,
  /all 49 pages/i,
  /49 fillable/i,
  /49 sequential/i,
  /49-page start path/i,
];

console.log('\n=== Page-count honesty ===\n');

check('public HTML does not claim a 49-page shipping file', () => {
  const hits = [];
  for (const page of pages) {
    const text = readFileSync(page, 'utf8');
    for (const re of FORBIDDEN) {
      if (re.test(text)) hits.push(`${page} matches ${re}`);
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

check('Essentials does not invent a 49-page extract SKU', () => {
  assert.doesNotMatch(index, /49-page start path/i);
  assert.match(index, /Fillable organizer PDF \+ print PDF/);
  assert.match(index, /Essentials edition: the fillable and printable family emergency binder/);
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

check('/start has no 49-page claims and uses Marketing lock', () => {
  assert.match(start, />Start tonight</);
  assert.match(start, /Copy message/);
  assert.match(start, /Point to where passwords live/);
  for (const re of FORBIDDEN) {
    assert.doesNotMatch(start, re);
  }
});

console.log(`\n${'='.repeat(46)}\n  ${pass} passed\n${'='.repeat(46)}\n`);
