#!/usr/bin/env node
/** Acceptance tests for authoritative owner-email delivery in POST /api/contact. */
process.env.RESEND_CONTACT_API_KEY = 'test-resend-key';
process.env.CONTACT_OWNER_EMAIL = 'info@familyfindersbook.com';
process.env.CONTACT_FROM_EMAIL = 'info@familyfindersbook.com';
process.env.CONTACT_NOTIFY_WEBHOOK_URL = 'https://hooks.example.test/finders-book';

const { default: handler } = await import('../api/contact.js');
let passed=0, failed=0, calls=[];
let resendMode='success', webhookMode='success';
const realFetch=globalThis.fetch;
globalThis.fetch=async (url, init={}) => {
  const u=String(url); const body=init.body ? JSON.parse(init.body) : null;
  calls.push({url:u, body, headers:init.headers||{}});
  const mode=u.includes('api.resend.com') ? resendMode : u.includes('hooks.example.test') ? webhookMode : 'unexpected';
  if (mode==='unexpected') throw new Error(`unexpected external call: ${u}`);
  if (mode==='throw') throw new Error('route down');
  if (mode==='reject') return {status:500,ok:false,text:async()=>''};
  return {status:200,ok:true,json:async()=>({id:'test-email-id'}),text:async()=>''};
};
function mockRes(){return{statusCode:0,payload:null,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v},status(c){this.statusCode=c;return this},json(o){this.payload=o;return this}}}
let ipSeq=1;
async function call(body,{method='POST',ip}={}){calls=[];const req={method,body,headers:{'x-forwarded-for':ip||`10.0.1.${ipSeq++}`},query:{}};const res=mockRes();await handler(req,res);return res}
function check(label,condition,detail=''){condition?passed++:failed++;console.log(`${condition?'PASS':'FAIL'}  ${label}`);if(detail)console.log(`        ${detail}`)}
const valid={name:'Jane Doe',email:'Jane.Doe@Example.com',message:'I want to know whether the Ultimate edition suits my situation.'};
const resendCalls=()=>calls.filter(c=>c.url.includes('api.resend.com'));
const webhookCalls=()=>calls.filter(c=>c.url.includes('hooks.example.test'));

console.log('\n=== Authoritative owner email; no marketing subscriber write ===\n');
for(const kind of ['question','feedback','licensing']){
  const res=await call({...valid,kind}); const email=resendCalls()[0]?.body||{};
  check(`${kind} succeeds only after Resend owner email acceptance`,res.statusCode===200&&res.payload?.ok===true&&resendCalls().length===1&&email.reply_to==='jane.doe@example.com'&&email.to?.[0]==='info@familyfindersbook.com');
  check(`${kind} keeps Slack/webhook secondary`,webhookCalls().length===1);
  check(`${kind} makes no MailerLite request`,calls.every(c=>!c.url.includes('mailerlite')));
}
{const res=await call({...valid});check('missing kind defaults to question',res.statusCode===200&&resendCalls()[0]?.body?.subject?.includes('Presale question'))}

console.log('\n=== Validation and abuse controls ===\n');
for(const [label,patch,error] of [['invalid email rejected',{email:'bad'},'invalid_email'],['blank name rejected',{name:'  '},'invalid_name'],['short message rejected',{message:'too short'},'invalid_message'],['unknown kind rejected',{kind:'refund-me-now'},'invalid_kind']]){const res=await call({...valid,...patch});check(label,res.statusCode===400&&res.payload?.error===error&&calls.length===0)}
{const res=await call(valid,{method:'GET'});check('GET rejected',res.statusCode===405&&calls.length===0)}
{const res=await call({...valid,company_website:'spam'});check('honeypot returns 200 and sends nothing',res.statusCode===200&&calls.length===0)}
{const ip='203.0.113.42';let first429=null;for(let i=1;i<=4;i++){const res=await call(valid,{ip});if(res.statusCode===429&&first429===null)first429=i}check('rate limit engages on fourth repeated submission',first429===4)}
{const long='x'.repeat(2500);const res=await call({...valid,message:long,kind:'licensing'});const stored=resendCalls()[0]?.body?.text||'';check('over-long message is bounded with truncation marker',res.statusCode===200&&stored.includes('truncated')&&stored.includes('2500'))}

console.log('\n=== Authoritative/secondary failure modes ===\n');
{delete process.env.RESEND_CONTACT_API_KEY;const res=await call(valid);check('missing Resend key fails loudly even when Slack is configured',res.statusCode===503&&res.payload?.error==='not_configured'&&calls.length===0);process.env.RESEND_CONTACT_API_KEY='test-resend-key'}
{resendMode='reject';const res=await call(valid);check('Resend rejection fails visitor submission',res.statusCode===502&&res.payload?.error==='upstream'&&resendCalls().length===1);resendMode='success'}
{resendMode='throw';const res=await call(valid);check('Resend network error fails visitor submission',res.statusCode===502&&res.payload?.error==='upstream'&&resendCalls().length===1);resendMode='success'}
{webhookMode='reject';const res=await call(valid);check('secondary webhook rejection does not hide successful owner email',res.statusCode===200&&res.payload?.ok===true&&resendCalls().length===1&&webhookCalls().length===1);webhookMode='success'}
{delete process.env.CONTACT_NOTIFY_WEBHOOK_URL;const res=await call(valid);check('secondary webhook may be absent when owner email succeeds',res.statusCode===200&&resendCalls().length===1&&webhookCalls().length===0);process.env.CONTACT_NOTIFY_WEBHOOK_URL='https://hooks.example.test/finders-book'}

globalThis.fetch=realFetch;
console.log(`\n==========================================\n  ${passed} passed, ${failed} failed\n==========================================\n`);
if(failed)process.exit(1);
