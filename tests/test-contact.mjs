#!/usr/bin/env node
/**
 * Acceptance tests for POST /api/contact.
 *
 * C12 contract:
 * - support/feedback/licensing is not a marketing subscription event;
 * - the route never calls MailerLite or adds a contact group;
 * - success means the owner-routing webhook accepted the message;
 * - missing/failed owner routing fails loudly so the page can show its
 *   support-email fallback;
 * - validation, honeypot, and rate limiting remain in force.
 */

process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/finders-book';

const { default: handler } = await import('../api/contact.js');

let passed = 0;
let failed = 0;
let calls = [];
let fetchMode = 'success';

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
  if (!String(url).includes('hooks.example.test')) {
    throw new Error(`unexpected external call: ${String(url)}`);
  }
  if (fetchMode === 'throw') throw new Error('owner route down');
  if (fetchMode === 'reject') return { status: 500, ok: false, text: async () => '' };
  return { status: 200, ok: true, json: async () => ({}), text: async () => '' };
};

function mockRes() {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.payload = obj; return this; },
    send(text) { this.payload = text; return this; },
  };
}

let ipSeq = 1;
async function call(body, { method = 'POST', ip } = {}) {
  calls = [];
  const req = {
    method,
    body,
    headers: { 'x-forwarded-for': ip || `10.0.1.${ipSeq++}` },
    query: {},
  };
  const res = mockRes();
  await handler(req, res);
  return res;
}

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`PASS  ${label}`);
  } else {
    failed++;
    console.log(`FAIL  ${label}`);
  }
  if (detail) console.log(`        ${detail}`);
}

const validBase = {
  name: 'Jane Doe',
  email: 'Jane.Doe@Example.com',
  message: 'I want to know whether the Ultimate edition suits my situation.',
};

console.log('\n=== Owner routing; no marketing subscriber write ===\n');
for (const kind of ['question', 'feedback', 'licensing']) {
  const res = await call({ ...validBase, kind });
  const body = calls[0]?.body || {};
  check(`${kind} accepted only after owner route succeeds`,
    res.statusCode === 200 && res.payload?.ok === true && calls.length === 1 && body.kind === kind,
    `status=${res.statusCode} calls=${calls.length}`);
  check(`${kind} makes no MailerLite request`,
    calls.every((c) => !c.url.includes('mailerlite')),
    calls.map((c) => c.url).join(', '));
}

{
  const res = await call({ ...validBase });
  check('missing kind defaults to question',
    res.statusCode === 200 && calls[0]?.body?.kind === 'question');
}
{
  const res = await call({ ...validBase, kind: 'question' });
  check('email normalized before owner alert',
    res.statusCode === 200 && calls[0]?.body?.email === 'jane.doe@example.com',
    calls[0]?.body?.email || '(none)');
}

console.log('\n=== Validation ===\n');
for (const [label, patch, error] of [
  ['invalid email rejected', { email: 'not-an-email' }, 'invalid_email'],
  ['blank name rejected', { name: '   ' }, 'invalid_name'],
  ['short message rejected', { message: 'too short' }, 'invalid_message'],
  ['unknown kind rejected', { kind: 'refund-me-now' }, 'invalid_kind'],
]) {
  const res = await call({ ...validBase, ...patch });
  check(label, res.statusCode === 400 && res.payload?.error === error && calls.length === 0,
    `status=${res.statusCode} error=${res.payload?.error} calls=${calls.length}`);
}
{
  const res = await call({ ...validBase }, { method: 'GET' });
  check('GET rejected', res.statusCode === 405 && calls.length === 0);
}

console.log('\n=== Abuse handling ===\n');
{
  const res = await call({ ...validBase, company_website: 'https://spam.example' });
  check('honeypot returns 200 and sends nothing',
    res.statusCode === 200 && calls.length === 0,
    `status=${res.statusCode} calls=${calls.length}`);
}
{
  const ip = '203.0.113.42';
  let first429 = null;
  for (let i = 1; i <= 4; i++) {
    const res = await call({ ...validBase }, { ip });
    if (res.statusCode === 429 && first429 === null) first429 = i;
  }
  check('rate limit engages on repeated submissions from one IP',
    first429 === 4,
    `first 429 on attempt ${first429}`);
}

console.log('\n=== Message handling ===\n');
{
  const long = 'x'.repeat(2500);
  const res = await call({ ...validBase, message: long, kind: 'licensing' });
  const stored = calls[0]?.body?.message || '';
  check('over-long message is bounded with explicit truncation marker',
    res.statusCode === 200 && stored.length <= 900 && stored.includes('truncated') && stored.includes('2500'),
    `alert message ${stored.length} chars`);
}

console.log('\n=== Owner-routing failure modes ===\n');
{
  delete process.env.CONTACT_NOTIFY_WEBHOOK_URL;
  const res = await call({ ...validBase });
  check('missing owner route fails loudly instead of pretending delivery',
    res.statusCode === 503 && res.payload?.error === 'not_configured' && calls.length === 0,
    `status=${res.statusCode}`);
  process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/finders-book';
}
{
  process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'http://hooks.example.test/finders-book';
  const res = await call({ ...validBase });
  check('plain-http owner route is rejected',
    res.statusCode === 503 && calls.length === 0,
    `status=${res.statusCode}`);
  process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/finders-book';
}
{
  fetchMode = 'reject';
  const res = await call({ ...validBase, kind: 'feedback' });
  check('owner route rejection fails visitor submission rather than losing it silently',
    res.statusCode === 502 && res.payload?.error === 'upstream' && calls.length === 1,
    `status=${res.statusCode}`);
  fetchMode = 'success';
}
{
  fetchMode = 'throw';
  const res = await call({ ...validBase, kind: 'question' });
  check('owner route network error fails visitor submission rather than losing it silently',
    res.statusCode === 502 && res.payload?.error === 'upstream' && calls.length === 1,
    `status=${res.statusCode}`);
  fetchMode = 'success';
}

globalThis.fetch = realFetch;

console.log('\n==========================================');
console.log(`  ${passed} passed, ${failed} failed`);
console.log('==========================================\n');
if (failed) process.exit(1);
