/** Week 4 gift path — /gift plus homepage and order entries. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gift = readFileSync('gift.html', 'utf8');
const js = readFileSync('gift.js', 'utf8');
const index = readFileSync('index.html', 'utf8');
const order = readFileSync('order.html', 'utf8');
const vercel = readFileSync('vercel.json', 'utf8');
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

const GUARANTEE = "If what you got isn’t what we showed, email us within 30 days and we’ll make it right.";
const LINE = 'Forward the email. Print the card. Start together on the Continuity Snapshot — fifteen minutes.';
const EYE = 'Giving this to someone you love';

console.log('\n=== Week 4 gift path ===\n');

check('gift page ships locked Writer copy and CTAs', () => {
  assert.match(gift, />Giving this to someone you love</);
  assert.ok(gift.includes(LINE));
  assert.match(gift, />Gift Essentials · \$29</);
  assert.match(gift, />Gift Ultimate · \$49</);
  assert.match(gift, /Instant download\. One-time\./);
  assert.ok(gift.includes(GUARANTEE));
});

check('gift card face uses locked front and back lines', () => {
  assert.match(gift, /For you — one clear place to start\./);
  assert.match(gift, /The Finder&rsquo;s Book/);
  assert.match(gift, /familyfindersbook\.com/);
  assert.match(gift, /Start with page 2 · Continuity Snapshot/);
  assert.match(gift, /Pointers, not passwords\. Not a will\./);
  assert.match(gift, /Designer print-ready PDF — placeholder/);
});

check('email templates are copy-only and stay on-device', () => {
  assert.match(gift, /Version A · Essentials/);
  assert.match(gift, /Version B · Ultimate/);
  assert.match(gift, /Nothing here emails anyone/);
  assert.match(gift, /data-copy="#giftEmailEssentials"/);
  assert.match(gift, /data-copy="#giftEmailUltimate"/);
  assert.match(js, /navigator\.clipboard/);
  assert.match(js, /execCommand\("copy"\)/);
  assert.doesNotMatch(js, /mailto:|mailerlite|XMLHttpRequest|fetch\(/i);
  assert.doesNotMatch(js, /mailerlite|campaign|subscriber/i);
  assert.doesNotMatch(gift, /type="submit"|action=|mailerlite/i);
});

check('Payhip SKUs stay eHcPG / Y1O7B / xPuv4', () => {
  assert.match(gift, /payhip\.com\/b\/eHcPG/);
  assert.match(gift, /payhip\.com\/b\/Y1O7B/);
  assert.match(gift, /order\.html#editions/);
  assert.match(gift, /Family Bundle/);
  assert.doesNotMatch(gift, /payhip\.com\/b\/Y107B/);
  assert.match(index, /data-placement="home-gift-essentials"/);
  assert.match(index, /href="https:\/\/payhip.com\/b\/eHcPG"/);
  assert.match(order, /data-placement="order-gift-ultimate"/);
  assert.match(order, /href="https:\/\/payhip.com\/b\/Y1O7B"/);
});

check('homepage and order expose the gift path', () => {
  assert.ok(index.includes(EYE));
  assert.ok(index.includes(LINE));
  assert.match(index, />Gift Essentials · \$29</);
  assert.match(index, />Gift Ultimate · \$49</);
  assert.match(index, /href="\/gift\.html"/);
  assert.match(index, /Gift this for a parent or partner/);
  assert.ok(order.includes(EYE));
  assert.ok(order.includes(LINE));
  assert.match(order, />Gift Essentials · \$29</);
  assert.match(order, />Gift Ultimate · \$49</);
  assert.match(order, /href="\/gift\.html"/);
});

check('footer chrome points at /gift.html', () => {
  assert.match(gift, /href="\/gift\.html">Gift for a parent</);
  assert.match(index, /href="\/gift\.html">Gift for a parent</);
  assert.match(order, /href="\/gift\.html">Gift for a parent</);
});

check('Week 1–3 honesty is preserved on the gift page', () => {
  assert.match(gift, /49-page first-hours organizer \(pages 001–049\)/);
  assert.match(gift, /250-page full system/);
  assert.match(gift, /pointer, not a vault/);
  assert.match(gift, /Michael David/);
  assert.match(gift, /assets\/finders-book-cover-800\.webp/);
  assert.doesNotMatch(gift, /aggregateRating|★★★★★|5-star|verified buyer|countdown|limited.time|only \d+ left/i);
  assert.doesNotMatch(gift, /see all 49|all 49 pages|49 pages = the whole book/i);
  assert.doesNotMatch(gift, /fridge card|secure vault setup|check-in plan|digital legacy/i);
});

check('/gift redirect and gift.js are in the deploy surface', () => {
  assert.match(vercel, /"\/gift"/);
  assert.match(vercel, /\/gift\.html/);
  assert.match(vercel, /gift\.js/);
  assert.match(gift, /<link rel="canonical" href="https:\/\/www\.familyfindersbook\.com\/gift\.html">/);
});

console.log(`\n${'='.repeat(46)}\n  ${pass} passed\n${'='.repeat(46)}\n`);
