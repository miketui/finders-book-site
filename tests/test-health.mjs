/** Health route must fail closed and never echo secret values. */
process.env.MAILERLITE_API_KEY = 'test-mailerlite-key';
process.env.PAYHIP_API_KEY = 'test-payhip-key';
process.env.PAYHIP_WEBHOOK_TOKEN = 'test-private-health-token';
process.env.GAP_CHECK_TOKEN_SECRET = 'test-gap-check-secret-that-is-at-least-32-bytes';

const { default: health } = await import('../api/health.js');

function mockRes() {
  return {
    statusCode: 0, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
}

let passed = 0;
let failed = 0;
function check(name, condition) {
  condition ? passed++ : failed++;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}`);
}

console.log('\n=== Private health route ===\n');

let res = mockRes();
health({ method: 'GET', query: { t: 'wrong' } }, res);
check('wrong token rejected', res.statusCode === 401);

res = mockRes();
health({ method: 'POST', query: { t: process.env.PAYHIP_WEBHOOK_TOKEN } }, res);
check('non-GET rejected', res.statusCode === 405);

res = mockRes();
health({ method: 'GET', query: { t: process.env.PAYHIP_WEBHOOK_TOKEN } }, res);
const serialised = JSON.stringify(res.payload);
check('correct token returns config presence', res.statusCode === 200 && res.payload?.secrets_present?.GAP_CHECK_TOKEN_SECRET === true);
check('health response never echoes secret values', !serialised.includes(process.env.MAILERLITE_API_KEY) && !serialised.includes(process.env.PAYHIP_API_KEY) && !serialised.includes(process.env.PAYHIP_WEBHOOK_TOKEN));
check('health does not expose group IDs, fingerprints, signatures, or product-map contents',
  !serialised.includes('194226') &&
  !serialised.includes('fingerprint') &&
  !serialised.includes('signature_prefix') &&
  !serialised.includes('eHcPG'));

const savedGapSecret = process.env.GAP_CHECK_TOKEN_SECRET;
process.env.GAP_CHECK_TOKEN_SECRET = 'too-short';
res = mockRes();
health({ method: 'GET', query: { t: process.env.PAYHIP_WEBHOOK_TOKEN } }, res);
check('short Gap Check secret reports false even when present',
  res.statusCode === 200 && res.payload?.secrets_present?.GAP_CHECK_TOKEN_SECRET === false);
process.env.GAP_CHECK_TOKEN_SECRET = savedGapSecret;

const savedSingle = process.env.PAYHIP_WEBHOOK_TOKEN;
delete process.env.PAYHIP_WEBHOOK_TOKEN;
process.env.PAYHIP_WEBHOOK_TOKENS = JSON.stringify(['old-rotation-token', 'new-rotation-token']);
res = mockRes();
health({ method: 'GET', query: { t: 'new-rotation-token' } }, res);
check('rotation array accepts any configured token',
  res.statusCode === 200 && res.payload?.behaviour?.webhook_token_mode === 'rotation_array');
delete process.env.PAYHIP_WEBHOOK_TOKENS;
process.env.PAYHIP_WEBHOOK_TOKEN = savedSingle;

const saved = process.env.PAYHIP_WEBHOOK_TOKEN;
delete process.env.PAYHIP_WEBHOOK_TOKEN;
res = mockRes();
health({ method: 'GET', query: {} }, res);
check('missing token configuration fails closed', res.statusCode === 503);
process.env.PAYHIP_WEBHOOK_TOKEN = saved;

console.log(`\n${'='.repeat(46)}\n  ${passed} passed, ${failed} failed\n${'='.repeat(46)}\n`);
process.exit(failed ? 1 : 0);
