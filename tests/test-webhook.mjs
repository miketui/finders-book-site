/**
 * Local verification for api/payhip-webhook.js.
 * Mocks MailerLite entirely — no network, no real subscribers, no emails.
 *   npm test
 */
import { createHash } from 'node:crypto';

process.env.MAILERLITE_API_KEY = 'test-ml-key';
process.env.PAYHIP_API_KEY = 'test-payhip-key';
process.env.PAYHIP_WEBHOOK_TOKEN = 'test-token-abc';

const GOOD_SIG = createHash('sha256').update('test-payhip-key', 'utf8').digest('hex');

const GROUP = {
  '194226608569059081': 'Finder\'s Book — Leads',
  '194226612687865798': 'All Customers',
  '194226609478173767': 'Essentials Buyers',
  '194226610412455586': 'Ultimate Buyers',
  '194226611505071661': 'Family Bundle Buyers',
  '194226614527067324': 'Refunded',
  '194226613598028898': 'Review Requested',
};

let calls = [];
let membership = new Set();
let failingRemoval = null;
globalThis.fetch = async (url, init = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url: String(url), method: init.method, body });
  if (String(url).endsWith('/subscribers')) {
    (body?.groups || []).forEach((group) => membership.add(String(group)));
    return {
      status: 201,
      ok: true,
      json: async () => ({ data: { id: 'sub_123', groups: [...membership].map((id) => ({ id })) } }),
      text: async () => '',
    };
  }
  if (String(url).endsWith('/subscribers/sub_123') && init.method === 'GET') {
    return {
      status: 200,
      ok: true,
      json: async () => ({ data: { id: 'sub_123', groups: [...membership].map((id) => ({ id })) } }),
      text: async () => '',
    };
  }
  if (init.method === 'DELETE') {
    const groupId = String(url).split('/').pop();
    if (groupId === failingRemoval) {
      return { status: 503, ok: false, json: async () => ({}), text: async () => 'temporary failure' };
    }
    const existed = membership.delete(groupId);
    return { status: existed ? 204 : 404, ok: existed, json: async () => ({}), text: async () => '' };
  }
  return { status: 500, ok: false, json: async () => ({}), text: async () => 'unexpected mock call' };
};

const { default: handler } = await import('../api/payhip-webhook.js');

function mockRes() {
  return {
    statusCode: 0, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
}

const item = (key) => ({
  product_id: '2804256',
  product_name: 'The Finder\u2019s Book',
  product_key: key,
  product_permalink: `https://payhip.com/b/${key}`,
  quantity: '1',
});

const paid = (keys, over = {}) => ({
  id: 'TX' + Math.random().toString(36).slice(2, 8),
  email: 'Buyer@Example.COM',
  currency: 'USD',
  price: 4900,
  items: keys.map(item),
  unconsented_from_emails: false,
  is_gift: false,
  type: 'paid',
  signature: GOOD_SIG,
  ...over,
});

const refund = (over = {}) => ({
  id: 'TX-refund',
  email: 'buyer@example.com',
  price: 4900,
  amount_refunded: 4900,
  items: [item('Y1O7B')],
  type: 'refunded',
  signature: GOOD_SIG,
  ...over,
});

let pass = 0, fail = 0;

async function check(name, body, expect, {
  token = 'test-token-abc',
  method = 'POST',
  initialGroups = [],
  failRemoval = null,
} = {}) {
  calls = [];
  membership = new Set(initialGroups);
  failingRemoval = failRemoval;
  const res = mockRes();
  await handler({ method, query: { t: token }, headers: {}, body }, res);

  const groupsHit = calls
    .filter((c) => c.body?.groups)
    .flatMap((c) => c.body.groups)
    .map((g) => GROUP[g] ?? g);
  const removals = calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop());
  const removalsNamed = removals.map((g) => GROUP[g] ?? g);

  const okStatus = res.statusCode === expect.status;
  const okAction = !expect.action || res.payload?.action === expect.action;
  const okError = !expect.error || res.payload?.error === expect.error;
  const okGroups = !expect.groups || JSON.stringify(groupsHit.sort()) === JSON.stringify([...expect.groups].sort());
  const okRemoved = !expect.removed || JSON.stringify(removalsNamed.sort()) === JSON.stringify([...expect.removed].sort());
  const good = okStatus && okAction && okError && okGroups && okRemoved;

  good ? pass++ : fail++;
  console.log(
    `${good ? 'PASS' : 'FAIL'}  ${name}`,
    `\n        -> ${res.statusCode} ${res.payload?.action ?? res.payload?.error ?? ''}` +
    (groupsHit.length ? ` | added: ${groupsHit.join(', ')}` : '') +
    (removalsNamed.length ? ` | removed: ${removalsNamed.join(', ')}` : '')
  );
  if (!good) {
    console.log('        expected:', JSON.stringify(expect));
  }
}

console.log('\n=== Payhip -> MailerLite routing ===\n');

await check('paid / Essentials (eHcPG)', paid(['eHcPG']),
  { status: 200, action: 'buyer_added', groups: ['All Customers', 'Essentials Buyers'], removed: ['Refunded', 'Finder\'s Book — Leads'] });

await check('paid / Ultimate (Y1O7B)', paid(['Y1O7B']),
  { status: 200, action: 'buyer_added', groups: ['All Customers', 'Ultimate Buyers'], removed: ['Refunded', 'Finder\'s Book — Leads'] });

await check('paid / Family Bundle (xPuv4)', paid(['xPuv4']),
  { status: 200, action: 'buyer_added', groups: ['All Customers', 'Family Bundle Buyers'], removed: ['Refunded', 'Finder\'s Book — Leads'] });

await check('paid / multi-item cart', paid(['eHcPG', 'xPuv4']),
  { status: 200, action: 'buyer_added', groups: ['All Customers', 'Essentials Buyers', 'Family Bundle Buyers'], removed: ['Refunded', 'Finder\'s Book — Leads'] });

await check('paid / product_key missing, permalink fallback',
  paid(['Y1O7B'], { items: [{ product_permalink: 'https://payhip.com/b/Y1O7B', quantity: '1' }] }),
  { status: 200, action: 'buyer_added', groups: ['All Customers', 'Ultimate Buyers'], removed: ['Refunded', 'Finder\'s Book — Leads'] });

await check('paid / unknown product key', paid(['ZZZZZ']),
  { status: 500, error: 'unmapped_product', groups: [] });

const savedProductMap = process.env.PAYHIP_PRODUCT_MAP;
process.env.PAYHIP_PRODUCT_MAP = JSON.stringify({ Y1O7B: 'ultimatte' });
await check('paid / invalid product-map tier fails closed', paid(['Y1O7B']),
  { status: 500, error: 'processing_failed', groups: [] });
if (savedProductMap === undefined) delete process.env.PAYHIP_PRODUCT_MAP;
else process.env.PAYHIP_PRODUCT_MAP = savedProductMap;

await check('paid / buyer declined marketing email',
  paid(['Y1O7B'], { unconsented_from_emails: true }),
  { status: 200, action: 'skipped_unconsented', groups: [] });

console.log('\n=== Refunds ===\n');

await check('refunded / full 4900 of 4900', refund(),
  { status: 200, action: 'refund_flagged', groups: ['Refunded'], removed: ['Ultimate Buyers', 'Review Requested', 'Finder\'s Book — Leads'] },
  { initialGroups: ['194226612687865798', '194226610412455586'] });

await check('refunded / Ultimate preserves separate Essentials purchase', refund(),
  { status: 200, action: 'refund_flagged', groups: ['Refunded'], removed: ['Ultimate Buyers', 'Review Requested', 'Finder\'s Book — Leads'] },
  { initialGroups: ['194226612687865798', '194226609478173767', '194226610412455586'] });

await check('refunded / partial 1000 of 4900', refund({ amount_refunded: 1000 }),
  { status: 200, action: 'ignored_partial_refund', groups: [] });

await check('refunded / unknown product does not revoke entitlements', refund({ items: [item('ZZZZZ')] }),
  { status: 500, error: 'unmapped_product', groups: [], removed: [] },
  { initialGroups: ['194226612687865798', '194226610412455586'] });

await check('refunded / repeated event is idempotent', refund(),
  { status: 200, action: 'refund_flagged', groups: ['Refunded'], removed: ['Ultimate Buyers', 'Review Requested', 'Finder\'s Book — Leads'] },
  { initialGroups: ['194226612687865798', '194226614527067324'] });

await check('refunded / MailerLite removal failure returns retryable 500', refund(),
  { status: 500, error: 'processing_failed', groups: ['Refunded'], removed: ['Ultimate Buyers', 'Ultimate Buyers', 'Ultimate Buyers'] },
  { initialGroups: ['194226612687865798', '194226610412455586'], failRemoval: '194226610412455586' });

await check('refunded / successful redelivery completes cleanup after transient failure', refund(),
  { status: 200, action: 'refund_flagged', groups: ['Refunded'], removed: ['Ultimate Buyers', 'Review Requested', 'Finder\'s Book — Leads'] },
  { initialGroups: ['194226612687865798', '194226610412455586', '194226614527067324'] });

console.log('\n=== Security ===\n');

await check('bad signature rejected', paid(['Y1O7B'], { signature: 'deadbeef' }),
  { status: 401, groups: [] });

await check('wrong URL token rejected', paid(['Y1O7B']),
  { status: 401, groups: [] }, { token: 'wrong-token' });

await check('GET rejected', paid(['Y1O7B']),
  { status: 405, groups: [] }, { method: 'GET' });

await check('malformed JSON rejected', '{not-json',
  { status: 400, groups: [] });

console.log('\n=== Edge cases ===\n');

await check('subscription.created ignored', { ...paid(['Y1O7B']), type: 'subscription.created' },
  { status: 200, action: 'ignored_event_type', groups: [] });

await check('missing email tolerated', paid(['Y1O7B'], { email: '' }),
  { status: 200, action: 'ignored_no_email', groups: [] });

const savedWebhookToken = process.env.PAYHIP_WEBHOOK_TOKEN;
delete process.env.PAYHIP_WEBHOOK_TOKEN;
await check('missing webhook token configuration fails closed', paid(['Y1O7B']),
  { status: 500, groups: [] });
process.env.PAYHIP_WEBHOOK_TOKEN = savedWebhookToken;

delete process.env.PAYHIP_WEBHOOK_TOKEN;
process.env.PAYHIP_WEBHOOK_TOKENS = JSON.stringify(['old-test-token', 'new-test-token']);
await check('rotation array accepts the second webhook token', paid(['Y1O7B']),
  { status: 200, action: 'buyer_added', groups: ['All Customers', 'Ultimate Buyers'], removed: ['Refunded', 'Finder\'s Book — Leads'] },
  { token: 'new-test-token' });
delete process.env.PAYHIP_WEBHOOK_TOKENS;
process.env.PAYHIP_WEBHOOK_TOKEN = savedWebhookToken;

// Email normalisation
calls = [];
const r = mockRes();
await handler({ method: 'POST', query: { t: 'test-token-abc' }, headers: {}, body: paid(['Y1O7B']) }, r);
const sent = calls.find((c) => c.body?.email)?.body;
const normalised = sent?.email === 'buyer@example.com';
const activeStatus = sent?.status === 'active';
normalised && activeStatus ? pass++ : fail++;
console.log(`${normalised && activeStatus ? 'PASS' : 'FAIL'}  buyer normalised to lowercase + status "active"\n        -> email=${sent?.email} status=${sent?.status}`);

console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}\n`);
process.exit(fail ? 1 : 0);
