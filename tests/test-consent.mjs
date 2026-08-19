/** Static consent regression guards; browser behavior is covered by smoke-render.mjs. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pages = [
  'index.html', 'about.html', 'order.html', 'contact.html',
  'privacy-policy.html', 'refund-policy.html', 'terms.html', '404.html',
];
const consent = readFileSync('consent.js', 'utf8');
const analytics = readFileSync('analytics.js', 'utf8');
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

console.log('\n=== Optional analytics consent ===\n');

check('all public pages load consent before analytics', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const consentIndex = html.search(/src=["']\/?consent\.js["']/);
    const analyticsIndex = html.search(/src=["']\/?analytics\.js["']/);
    assert.ok(consentIndex >= 0, `${page} missing consent.js`);
    assert.ok(consentIndex < analyticsIndex, `${page} order`);
  }
});

check('no public page directly loads an analytics provider', () => {
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js|\/_vercel\/insights\/script\.js/);
  }
});

check('consent manager owns both provider loaders', () => {
  assert.match(consent, /googletagmanager\.com\/gtag\/js/);
  assert.match(consent, /\/_vercel\/insights\/script\.js/);
});

check('allow and decline are explicit stored states', () => {
  assert.match(consent, /"granted"/);
  assert.match(consent, /"denied"/);
  assert.match(consent, /localStorage\.setItem/);
});

check('withdrawal disables GA and removes accessible GA cookies', () => {
  assert.match(consent, /ga-disable-/);
  assert.match(consent, /analytics_storage: "denied"/);
  assert.match(consent, /\^_ga/);
});

check('site event bus drops events without granted consent', () => {
  assert.match(analytics, /fbAnalyticsConsent !== "granted"/);
});

check('checkout attribution bridge is consent-gated and uses Payhip metadata', () => {
  assert.match(consent, /fbGaMeasurementId = GA_ID/);
  assert.match(analytics, /window\.fbAnalyticsConsent === "granted"/);
  assert.match(analytics, /gtag\("get", window\.fbGaMeasurementId, "client_id"/);
  assert.match(analytics, /gtag\("get", window\.fbGaMeasurementId, "session_id"/);
  assert.match(analytics, /metadata\[ga_client_id\]/);
  assert.match(analytics, /metadata\[ga_session_id\]/);
  assert.match(analytics, /url\.pathname = "\/buy"/);
  assert.match(analytics, /url\.searchParams\.set\("link", match\[1\]\)/);
});

console.log(`\n${'='.repeat(46)}\n  ${pass} passed\n${'='.repeat(46)}\n`);
