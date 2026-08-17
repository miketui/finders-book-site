#!/usr/bin/env node
/**
 * test-contact.mjs — routing and validation for POST /api/contact.
 *
 * The route this replaces was dead on arrival: contact.js shipped with an
 * empty form endpoint and three empty group IDs, so every "Send message"
 * silently fell through to the support-address fallback. Nothing in CI
 * noticed, because nothing tested it.
 *
 * This asserts the parts that fail quietly:
 *   1. Each enquiry kind lands in ITS OWN group, never the Leads group
 *   2. Validation rejects bad input before it reaches MailerLite
 *   3. The honeypot returns 200 so bots learn nothing
 *   4. Long messages are truncated rather than silently rejected upstream
 *   5. Subscribers are created unconfirmed (not marketable without consent)
 *
 *   node tests/test-contact.mjs
 */

const LEADS_GROUP = '194226608569059081';

const GROUPS = {
  question: '195847261261923400',
  feedback: '195847261915186382',
  licensing: '195847263345444315',
};

process.env.MAILERLITE_API_KEY = 'test-key-not-a-real-secret';

const { default: handler } = await import('../api/contact.js');

let passed = 0;
let failed = 0;
let lastUpstream = null;

let lastNotification = null;

/** Intercept the MailerLite call so no network request is made. */
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('hooks.example.test')) {
    lastNotification = { url: String(url), body: JSON.parse(init.body) };
    return { status: 200, ok: true, json: async () => ({}), text: async () => '' };
  }
  lastUpstream = { url: String(url), body: JSON.parse(init.body) };
  return {
    status: 201,
    ok: true,
    json: async () => ({ data: { id: '1' } }),
    text: async () => '',
  };
};

function mockRes() {
  const res = {
    statusCode: 0,
    payload: null,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
    send(text) { this.payload = text; return this; },
  };
  return res;
}

async function call(body, { method = 'POST' } = {}) {
  lastUpstream = null;
  lastNotification = null;
  const req = { method, body, headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250)}` }, query: {} };
  const res = mockRes();
  await handler(req, res);
  return res;
}

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}`);
    if (detail) console.log(`        ${detail}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}`);
    if (detail) console.log(`        ${detail}`);
  }
}

const validBase = {
  name: 'Jane Doe',
  email: 'Jane.Doe@Example.com',
  message: 'I want to know whether the Ultimate edition suits my situation.',
};

console.log('\n=== Routing: each kind to its own group ===\n');

for (const kind of ['question', 'feedback', 'licensing']) {
  const res = await call({ ...validBase, kind });
  const groups = lastUpstream?.body?.groups ?? [];
  check(
    `${kind} -> its own group`,
    res.statusCode === 200 && groups.length === 1 && groups[0] === GROUPS[kind],
    `-> ${res.statusCode} | groups: ${groups.join(',') || '(none)'}`
  );
}

console.log('\n=== The rule that matters: never the Leads group ===\n');

for (const kind of ['question', 'feedback', 'licensing']) {
  await call({ ...validBase, kind });
  const groups = lastUpstream?.body?.groups ?? [];
  check(
    `${kind} does NOT enter the Gap Check nurture list`,
    !groups.includes(LEADS_GROUP),
    `a support question in the Leads group would receive the lead sequence`
  );
}

console.log('\n=== Defaults and normalisation ===\n');

{
  const res = await call({ ...validBase });
  check('missing kind defaults to question',
    res.statusCode === 200 && lastUpstream.body.groups[0] === GROUPS.question,
    `-> ${res.statusCode}`);
}
{
  await call({ ...validBase, kind: 'question' });
  check('email normalised to lowercase',
    lastUpstream.body.email === 'jane.doe@example.com',
    `email=${lastUpstream.body.email}`);
}
{
  await call({ ...validBase, kind: 'question' });
  check('subscriber created unconfirmed, not marketable',
    lastUpstream.body.status === 'unconfirmed',
    `status=${lastUpstream.body.status}`);
}
{
  await call({ ...validBase, kind: 'feedback' });
  check('kind and message stored as custom fields',
    lastUpstream.body.fields?.contact_kind === 'feedback' &&
    typeof lastUpstream.body.fields?.contact_message === 'string' &&
    lastUpstream.body.fields?.name === 'Jane Doe',
    `contact_kind=${lastUpstream.body.fields?.contact_kind}`);
}

console.log('\n=== Validation ===\n');

{
  const res = await call({ ...validBase, email: 'not-an-email' });
  check('invalid email rejected', res.statusCode === 400 && res.payload.error === 'invalid_email',
    `-> ${res.statusCode} ${res.payload.error}`);
}
{
  const res = await call({ ...validBase, name: '   ' });
  check('blank name rejected', res.statusCode === 400 && res.payload.error === 'invalid_name',
    `-> ${res.statusCode} ${res.payload.error}`);
}
{
  const res = await call({ ...validBase, message: 'too short' });
  check('too-short message rejected', res.statusCode === 400 && res.payload.error === 'invalid_message',
    `-> ${res.statusCode} ${res.payload.error}`);
}
{
  const res = await call({ ...validBase, kind: 'refund-me-now' });
  check('unknown kind rejected rather than silently defaulted',
    res.statusCode === 400 && res.payload.error === 'invalid_kind',
    `-> ${res.statusCode} ${res.payload.error}`);
}
{
  const res = await call({ ...validBase }, { method: 'GET' });
  check('GET rejected', res.statusCode === 405, `-> ${res.statusCode}`);
}

console.log('\n=== Abuse handling ===\n');

{
  const res = await call({ ...validBase, company_website: 'https://spam.example' });
  check('honeypot returns 200 and sends nothing upstream',
    res.statusCode === 200 && lastUpstream === null,
    `-> ${res.statusCode} | upstream called: ${lastUpstream !== null}`);
}
{
  const ip = '203.0.113.42';
  let limitedAt = null;
  for (let i = 1; i <= 6; i++) {
    const req = { method: 'POST', body: { ...validBase }, headers: { 'x-forwarded-for': ip }, query: {} };
    const res = mockRes();
    await handler(req, res);
    if (res.statusCode === 429 && limitedAt === null) limitedAt = i;
  }
  check('rate limit engages on repeated submissions from one IP',
    limitedAt !== null, `first 429 on attempt ${limitedAt}`);
}

console.log('\n=== Long message handling ===\n');

{
  const long = 'x'.repeat(2500);
  const res = await call({ ...validBase, message: long, kind: 'licensing' });
  const stored = lastUpstream?.body?.fields?.contact_message ?? '';
  check('over-long message truncated with a marker, not dropped',
    res.statusCode === 200 && stored.length < 2500 && stored.includes('truncated') && stored.includes('2500'),
    `stored ${stored.length} chars, marker present: ${stored.includes('truncated')}`);
}

console.log('\n=== Owner notification ===\n');

{
  const res = await call({ ...validBase, kind: 'question' });
  check('no notification attempted when no alert endpoint is configured',
    res.statusCode === 200 && lastNotification === null);
}

{
  process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/finders-book';
  const res = await call({ ...validBase, kind: 'licensing' });
  const body = lastNotification?.body ?? {};
  check('stored message also alerts the owner so replying does not depend on polling MailerLite',
    res.statusCode === 200 && Boolean(lastNotification)
    && body.kind === 'licensing'
    && String(body.text).includes('Jane Doe')
    && String(body.email) === 'jane.doe@example.com',
    `-> ${res.statusCode} | alerted: ${Boolean(lastNotification)} kind=${body.kind}`);
}

{
  // http:// is refused rather than silently downgraded — the alert carries the
  // sender's address and must not travel in the clear.
  process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'http://hooks.example.test/finders-book';
  const res = await call({ ...validBase, kind: 'question' });
  check('plain-http alert endpoint is ignored, not used',
    res.statusCode === 200 && lastNotification === null);
}

{
  process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/finders-book';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('hooks.example.test')) throw new Error('alert endpoint down');
    return originalFetch(url, init);
  };
  const res = await call({ ...validBase, kind: 'feedback' });
  check('a failing alert endpoint does not fail the visitor\'s message',
    res.statusCode === 200 && res.payload.ok === true,
    `-> ${res.statusCode}`);
  globalThis.fetch = originalFetch;
  delete process.env.CONTACT_NOTIFY_WEBHOOK_URL;
}

console.log('\n=== Not configured ===\n');

{
  delete process.env.MAILERLITE_API_KEY;
  const res = await call({ ...validBase });
  check('missing API key fails loudly rather than pretending to send',
    res.statusCode === 503 && res.payload.error === 'not_configured',
    `-> ${res.statusCode} ${res.payload.error}`);
  process.env.MAILERLITE_API_KEY = 'test-key-not-a-real-secret';
}

globalThis.fetch = realFetch;

console.log('\n==============================================');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('==============================================\n');

if (failed) process.exit(1);
