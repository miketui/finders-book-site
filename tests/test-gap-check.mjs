/**
 * Local verification for the Gap Check subscribe -> signed download chain.
 * MailerLite is mocked; the real PDF is read from the repository.
 */
import { createHmac } from 'node:crypto';

process.env.MAILERLITE_API_KEY = 'test-ml-key';
process.env.GAP_CHECK_TOKEN_SECRET = 'test-gap-check-secret-that-is-at-least-32-bytes';

let upstreamStatus = 201;
let calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
  return {
    status: upstreamStatus,
    ok: upstreamStatus >= 200 && upstreamStatus < 300,
    json: async () => ({ data: { id: 'sub_gap_123' } }),
    text: async () => '',
  };
};

const { default: subscribe } = await import('../api/gap-check-subscribe.js');
const { default: download } = await import('../api/gap-check-download.js');

function mockRes() {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
    send(p) { this.body = p; return this; },
    end(p) { this.body = p; return this; },
  };
}

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `\n        -> ${detail}` : ''}`);
}

function req(body, ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`) {
  return { method: 'POST', headers: { 'x-forwarded-for': ip }, body };
}

function expiredToken() {
  const b64 = (value) => Buffer.from(value).toString('base64url');
  const payload = b64(JSON.stringify({ email: 'old@example.com', exp: Date.now() - 1000 }));
  const sig = createHmac('sha256', process.env.GAP_CHECK_TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

console.log('\n=== Gap Check subscribe and delivery ===\n');

calls = [];
let res = mockRes();
await subscribe(req({ email: '  Family@Example.COM ', name: '  Joanne  ' }), res);
const issuedToken = res.payload?.token;
const sent = calls[0]?.body;
check('valid signup returns a signed token', res.statusCode === 200 && typeof issuedToken === 'string' && issuedToken.includes('.'));
const issuedClaims = JSON.parse(Buffer.from(issuedToken.split('.')[0], 'base64url').toString('utf8'));
check('issued download token contains exactly one numeric expiry claim and no additional data',
  typeof issuedClaims.exp === 'number' && Object.keys(issuedClaims).sort().join(',') === 'exp');
check('signup normalises email and uses Leads group', sent?.email === 'family@example.com' && sent?.groups?.[0] === '194226608569059081');
check('signup defaults to unconfirmed consent state', sent?.status === 'unconfirmed');
check('signup trims and maps the optional name', sent?.fields?.name === 'Joanne');

res = mockRes();
download({ method: 'GET', query: { token: issuedToken } }, res);
check('issued token downloads the PDF', res.statusCode === 200 && Buffer.isBuffer(res.body) && res.body.length > 10_000);
check('download has safe attachment headers', res.headers['content-type'] === 'application/pdf' && /attachment/.test(res.headers['content-disposition']));

res = mockRes();
download({ method: 'GET', query: { token: `${issuedToken}tampered` } }, res);
check('tampered token is rejected', res.statusCode === 403);

res = mockRes();
download({ method: 'GET', query: { token: expiredToken() } }, res);
check('expired token is rejected', res.statusCode === 403);

res = mockRes();
download({ method: 'GET', query: {} }, res);
check('missing token is rejected', res.statusCode === 400);

calls = [];
res = mockRes();
await subscribe(req({ email: 'not-an-email' }), res);
check('invalid email is rejected before MailerLite', res.statusCode === 400 && calls.length === 0);

calls = [];
res = mockRes();
await subscribe(req({ email: 'bot@example.com', company_website: 'spam.example' }), res);
check('honeypot succeeds silently without issuing a download', res.statusCode === 200 && !res.payload?.token && calls.length === 0);

upstreamStatus = 422;
res = mockRes();
await subscribe(req({ email: 'existing@example.com' }), res);
check('existing subscriber still receives a download token', res.statusCode === 200 && typeof res.payload?.token === 'string');
upstreamStatus = 201;

const savedKey = process.env.MAILERLITE_API_KEY;
delete process.env.MAILERLITE_API_KEY;
res = mockRes();
await subscribe(req({ email: 'valid@example.com' }), res);
check('missing configuration fails closed', res.statusCode === 503);
process.env.MAILERLITE_API_KEY = savedKey;

res = mockRes();
await subscribe({ method: 'GET', headers: {}, body: {} }, res);
check('unsupported subscribe method is rejected', res.statusCode === 405);

const rateIp = '198.51.100.77';
let last;
for (let i = 0; i < 6; i++) {
  last = mockRes();
  await subscribe(req({ email: `rate${i}@example.com` }, rateIp), last);
}
check('per-instance rate limit rejects the sixth request', last.statusCode === 429);

console.log(`\n${'='.repeat(46)}\n  ${passed} passed, ${failed} failed\n${'='.repeat(46)}\n`);
process.exit(failed ? 1 : 0);
