/** Static consent regression guards; browser behavior is covered by smoke-render.mjs. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const pages = [
  'index.html', 'about.html', 'order.html', 'contact.html', 'start.html',
  'privacy-policy.html', 'refund-policy.html', 'terms.html', '404.html',
];
const consent = readFileSync('consent.js', 'utf8');
const analytics = readFileSync('analytics.js', 'utf8');
let pass = 0;

function bootConsent(choice = null) {
  const stored = new Map();
  if (choice) stored.set('fb_analytics_consent_v1', choice);
  const scripts = [];
  const document = {
    readyState: 'loading',
    cookie: '',
    addEventListener() {},
    getElementById() { return null; },
    createElement() { return {}; },
    head: { appendChild(script) { scripts.push(script.src); } },
  };
  const window = { dispatchEvent() {} };
  const localStorage = {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, value); },
  };
  const location = { hostname: 'www.familyfindersbook.com' };
  function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; }
  runInNewContext(consent, { window, document, localStorage, location, CustomEvent });
  return {
    choice: window.fbAnalyticsConsent,
    queue: Array.from(window.dataLayer, (entry) => Array.from(entry)),
    scripts,
  };
}

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

check('consent defaults to denied before the Google tag is configured', () => {
  const defaultIndex = consent.indexOf('window.gtag("consent", "default"');
  const configIndex = consent.indexOf('window.gtag("config", GA_ID');
  assert.ok(defaultIndex >= 0, 'missing consent default');
  assert.ok(configIndex > defaultIndex, 'consent default must precede tag config');
  const defaultBlock = consent.slice(defaultIndex, configIndex);
  assert.match(defaultBlock, /ad_storage:\s*"denied"/);
  assert.match(defaultBlock, /analytics_storage:\s*"denied"/);
  assert.match(defaultBlock, /ad_user_data:\s*"denied"/);
  assert.match(defaultBlock, /ad_personalization:\s*"denied"/);
});

check('grant is an explicit consent update before analytics loads', () => {
  const grantIndex = consent.indexOf('analytics_storage: "granted"');
  const loadIndex = consent.indexOf('loadAnalytics();', grantIndex);
  assert.ok(grantIndex >= 0, 'missing granted consent update');
  assert.ok(loadIndex > grantIndex, 'grant must be queued before provider loading');
});

check('runtime consent queue preserves provider blocking and command order', () => {
  const unknown = bootConsent();
  assert.equal(unknown.choice, 'unknown');
  assert.equal(unknown.scripts.length, 0);
  assert.deepEqual(unknown.queue[0].slice(0, 2), ['consent', 'default']);
  assert.equal(unknown.queue[0][2].analytics_storage, 'denied');

  const granted = bootConsent('granted');
  const commands = granted.queue.map((entry) => entry.slice(0, 2).join(':'));
  assert.equal(granted.choice, 'granted');
  assert.deepEqual(commands.slice(0, 4), [
    'consent:default',
    'consent:update',
    'js:' + granted.queue[2][1],
    'config:G-ZXX0M4VYT5',
  ]);
  assert.equal(granted.queue[0][2].analytics_storage, 'denied');
  assert.equal(granted.queue[1][2].analytics_storage, 'granted');
  assert.equal(granted.scripts.length, 2);
  assert.match(granted.scripts[0], /googletagmanager\.com\/gtag\/js\?id=G-ZXX0M4VYT5/);
  assert.equal(granted.scripts[1], '/_vercel/insights/script.js');
});

check('withdrawal disables GA and removes accessible GA cookies', () => {
  assert.match(consent, /ga-disable-/);
  assert.match(consent, /analytics_storage: "denied"/);
  assert.match(consent, /\^_ga/);
});

check('site event bus drops events without granted consent', () => {
  assert.match(analytics, /fbAnalyticsConsent !== "granted"/);
  assert.match(analytics, /gaParams\.send_to = window\.fbGaMeasurementId/);
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
