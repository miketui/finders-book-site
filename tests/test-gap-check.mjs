/**
 * Gap Check: on-page scored product + held MailerLite path.
 * MailerLite is mocked and must not be called unless explicitly enabled.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

process.env.MAILERLITE_API_KEY = 'test-ml-key';
process.env.GAP_CHECK_TOKEN_SECRET = 'test-gap-check-secret-that-is-at-least-32-bytes';
delete process.env.GAP_CHECK_MAILERLITE_ENABLED;

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

const index = readFileSync('index.html', 'utf8');
const gapJs = readFileSync('gap-check.js', 'utf8');
const pdf = readFileSync('Family-Readiness-Gap-Check.pdf');
const pdfText = execFileSync('python3', ['-c', 'from pypdf import PdfReader; print(PdfReader("Family-Readiness-Gap-Check.pdf").pages[0].extract_text() or "")'], { encoding: 'utf8' });
const gapHtml = index.split('id="gap-check"')[1]?.split('id="faq"')[0] || '';

const QUESTIONS = [
  'If you were unreachable tonight, would someone know the **first person to call**?',
  'Is there a named **backup** if that first person does not answer?',
  'Would someone know who handles **children, dependents, or pets** in the first hour?',
  'Could someone find where the **signed will** (if you have one) is physically kept?',
  'Could someone find your **power of attorney** or healthcare directive — or confirm you do not have one yet?',
  'Is there a single written list of **where the important originals live** (not the documents themselves — the locations)?',
  'Does at least one trusted person know **where the binder or files would be**?',
  'Have you written down **who may know what, and when** (now / later / never) — even roughly?',
  'Is there a clear pointer to the **separate place** where passwords and PINs actually live? (Not the passwords themselves.)',
  'Could someone identify your **primary bank or credit union by name** without digging through mail for an hour?',
  'Could someone find **insurance contacts** (health, home, or auto — whichever you carry) by name or phone?',
  'Is there a note for **life-critical medication or care instructions** a helper would need in the first night?',
];

const BONUS_LEAK = /fridge card|vault setup|check-in plan|handoff scripts|digital legacy/i;

console.log('\n=== Gap Check on-page product ===\n');

check('email gate copy is gone', !/Send me the Gap Check/.test(index) && !/You score it yourself/.test(index));
check('intro is the REV2 lock', index.includes('Twelve questions. About four minutes. Answer for your household as it is tonight — not as you wish it were.'));
check('scoring instruction is the REV2 lock', index.includes('Count every “Yes — we could find this tonight.” Your result is that number out of 12.'));
check('answer labels are locked', index.includes('Yes — we could find this tonight') && index.includes('No — not tonight'));
check('instant score template is present',
  gapJs.includes('Your family would find ') && gapJs.includes(' of 12 things tonight.'));
check('all 12 Editor REV2 questions are on the page', QUESTIONS.every((q) => {
  const visible = q.replace(/\*\*(.*?)\*\*/g, '$1');
  const htmlish = q.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return index.includes(visible) || index.includes(htmlish);
}));
check('score is not email-gated', /id="gapResults"/.test(index) && /id="gapQuiz"/.test(index) && /Email me this score \+ the 1-page checklist/.test(index));
check('primary CTA is Ultimate $49 with checkout attrs',
  /Fix the four blanks — Ultimate, \$49/.test(index)
  && /data-placement="gap-check"/.test(index)
  && /data-tier="ultimate"/.test(index)
  && /data-price="49"/.test(index)
  && /payhip\.com\/b\/Y1O7B/.test(gapHtml));
check('CTA helper names the four blanks only', index.includes('Start with the Continuity Snapshot, two trusted people, document locations, and a pointer to where passwords live. Instant download.'));
check('Week 1 30-day guarantee sits under the Gap Check CTA', /id="gapResults"[\s\S]*email us within 30 days and we’ll make it right/.test(index));
check('bands are locked', [
  'Most of the first-hour basics are still in someone’s head. A short first pass would change that.',
  'Some pieces are findable. The gaps are usually people, locations, or access — not more paperwork.',
  'You are ahead of most households. Fill the remaining blanks while it is still calm.',
  'The map is largely in place. Review it after the next big life change.',
].every((band) => gapJs.includes(band)));
const jsPublic = gapJs.replace(/var BONUS_LEAK[\s\S]*?;/, '');
check('Gap Check HTML/JS/PDF do not leak Ultimate bonuses',
  !BONUS_LEAK.test(gapHtml) && !BONUS_LEAK.test(jsPublic) && !BONUS_LEAK.test(pdfText || pdf.toString('latin1')));
const strip = index.match(/<div class="creator-strip"[\s\S]*?<\/div>\s*<div class="trust-foot">/)?.[0] || '';
check('creator strip names both people and invents no portraits',
  strip.includes('Joanne Godfrey')
  && strip.includes('Michael David')
  && strip.includes('Portrait to come')
  && !/<(img|svg)\b/i.test(strip));
check('public byline stays Michael David', /rfield-label">Created by[\s\S]*Michael David/.test(index));
check('no AggregateRating or invented reviews', !/aggregateRating|★★★★★|5-star|verified buyer/i.test(index));

console.log('\n=== Gap Check subscribe hold ===\n');

calls = [];
let res = mockRes();
await subscribe(req({ email: '  Family@Example.COM ', name: '  Joanne  ' }), res);
const issuedToken = res.payload?.token;
check('held signup returns a signed token without MailerLite',
  res.statusCode === 200 && res.payload?.held === true && typeof issuedToken === 'string' && calls.length === 0);
const issuedClaims = JSON.parse(Buffer.from(issuedToken.split('.')[0], 'base64url').toString('utf8'));
check('issued download token contains exactly one numeric expiry claim and no additional data',
  typeof issuedClaims.exp === 'number' && Object.keys(issuedClaims).sort().join(',') === 'exp');

res = mockRes();
download({ method: 'GET', query: { token: issuedToken } }, res);
check('issued token downloads the PDF', res.statusCode === 200 && Buffer.isBuffer(res.body) && res.body.length > 5_000);
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

const savedKey = process.env.MAILERLITE_API_KEY;
delete process.env.MAILERLITE_API_KEY;
res = mockRes();
await subscribe(req({ email: 'valid@example.com' }), res);
check('held path does not require MailerLite when sends are off', res.statusCode === 200 && res.payload?.held === true);
process.env.MAILERLITE_API_KEY = savedKey;

process.env.GAP_CHECK_MAILERLITE_ENABLED = '1';
calls = [];
res = mockRes();
await subscribe(req({ email: '  Family@Example.COM ', name: '  Joanne  ' }), res);
const sent = calls[0]?.body;
check('enabled path still posts to MailerLite', res.statusCode === 200 && calls.length === 1 && sent?.email === 'family@example.com');
check('enabled signup uses Leads group and unconfirmed status', sent?.groups?.[0] === '194226608569059081' && sent?.status === 'unconfirmed');
check('enabled signup trims and maps the optional name', sent?.fields?.name === 'Joanne');

upstreamStatus = 422;
res = mockRes();
await subscribe(req({ email: 'existing@example.com' }), res);
check('existing subscriber still receives a download token', res.statusCode === 200 && typeof res.payload?.token === 'string');
upstreamStatus = 201;

delete process.env.MAILERLITE_API_KEY;
res = mockRes();
await subscribe(req({ email: 'valid@example.com' }), res);
check('enabled path fails closed without MailerLite', res.statusCode === 503);
process.env.MAILERLITE_API_KEY = savedKey;
delete process.env.GAP_CHECK_MAILERLITE_ENABLED;

console.log('\n=== Gap Check PDF one-pager ===\n');
check('lead magnet is a single-page PDF', (() => {
  const text = execFileSync('python3', ['-c', 'from pypdf import PdfReader; r=PdfReader("Family-Readiness-Gap-Check.pdf"); print(len(r.pages))'], { encoding: 'utf8' }).trim();
  return text === '1';
})());
check('PDF is diagnostic-only and honest',
  /Family Readiness Gap Check/.test(pdfText)
  && /Yes - we could find this tonight/.test(pdfText)
  && /of 12 things tonight/.test(pdfText)
  && !/49-page/.test(pdfText)
  && !BONUS_LEAK.test(pdfText));

console.log(`\n${'='.repeat(46)}\n  ${passed} passed, ${failed} failed\n${'='.repeat(46)}\n`);
process.exit(failed ? 1 : 0);
