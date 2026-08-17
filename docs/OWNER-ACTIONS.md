# Owner actions — what code cannot close

Everything in this file needs a human with an account login. Each item records
what was **verified live on 2026-08-17**, so the next person starts from
evidence rather than from the assumption in an older document.

Several items here contradict the 17 August traffic plan. That plan's data was
gathered before the 15–16 August MailerLite work; where this file and that plan
disagree, this file was checked against the live accounts.

---

## 1. MailerLite automations — naming is dangerously stale

**Verified live (account 2202141), 2026-08-17:**

| Automation | State | Emails |
|---|---|---|
| DRAFT — Refund Handling — DO NOT ENABLE | off | 2 steps |
| **DRAFT — Essentials Onboarding — DO NOT ENABLE** | **ON** | 4 emails, all `is_designed: true`, real subjects |
| DRAFT — Readiness Lead Nurture — DO NOT ENABLE | off | 10 steps |
| **DRAFT — Ultimate Onboarding — DO NOT ENABLE** | **ON** | 8 steps |
| Finder's Book — Family Bundle Onboarding | ON | 8 steps |
| Finder's Book — Review Request | ON | 5 steps |
| Finder's Book — Gap Check Lead Nurture | ON | 3 emails, all designed, correct trigger |
| **Finder's Book — Buyer Onboarding** | **OFF** | 5 steps |
| Finder's Book — Contact Acknowledgement | ON | 1 step |

**Corrections to the traffic plan:**

- It says six "DO NOT ENABLE" automations are switched on. Two are.
- It says all seven emails still hold MailerLite placeholder bodies. They do
  not. Every email inspected reports `is_designed: true` with real subject
  lines, sending from `info@familyfindersbook.com` as "Joanne and Michael",
  updated 15–16 August. (The generic "your email software can't display HTML"
  text in the API response is MailerLite's standard plain-text fallback, not a
  placeholder body — that is what the earlier read mistook.)
- Duplicate sends are **not** currently possible: the two enabled DRAFT
  onboarding automations carry the real content, and the newer generic
  "Buyer Onboarding" that would have overlapped them is switched off.

**What you must decide (nobody else can):**

1. Which buyer sequence is canonical — the two enabled DRAFT-named ones, or
   the disabled "Buyer Onboarding". **Do not enable Buyer Onboarding while the
   DRAFT ones are on**: they trigger on the same buyer groups, and that is
   exactly the duplicate-email scenario the traffic plan warned about.
2. Once decided, **rename the survivors**. A live automation called
   "DO NOT ENABLE" will eventually be switched off by whoever reads the name
   and believes it, taking buyer onboarding down silently.

The MailerLite API has no reliable enable/disable toggle. Do this in the
dashboard: <https://dashboard.mailerlite.com/automations>

## 2. Email authentication — DKIM is the one real gap

**Verified live via DNS, 2026-08-17:**

| Record | State |
|---|---|
| SPF | ✅ `v=spf1 include:_spf.mlsend.com include:spf.privateemail.com ~all` |
| DMARC | ✅ `v=DMARC1; p=none; rua=mailto:info@familyfindersbook.com` |
| MailerLite domain verification | ✅ present |
| MX | ✅ `mx1/mx2.privateemail.com` — real mailbox on the domain |
| **DKIM** | ❌ **not found** at `mailerlite._domainkey` or twelve other common selectors |

**Corrections to the traffic plan:** it states there is no SPF, DKIM or DMARC
and that mail sends from a gmail.com address. SPF and DMARC exist, and the
automations send from `info@familyfindersbook.com`.

**Do this:**

1. MailerLite → Settings → Domains → authenticate `familyfindersbook.com`, and
   publish the DKIM record it gives you. Without DKIM, DMARC alignment relies on
   SPF alone and forwarded mail fails.
2. Once DKIM is live and `rua` reports look clean for a week or two, tighten
   DMARC from `p=none` to `p=quarantine`.
3. Confirm with <https://www.mail-tester.com> — target 9/10 or better.

## 3. GA4 — two settings and one secret

The webhook now reports revenue server-side, but it stays silent until you
create the credential.

**Do this:**

1. GA4 → Admin → Data streams → the web stream → **Measurement Protocol API
   secrets** → Create. Put the value in Vercel as `GA4_API_SECRET`, and the
   stream's `G-…` id as `GA4_MEASUREMENT_ID`. Redeploy.
2. Same screen → **List unwanted referrals**: add `familyfindersbook.com` and
   `payhip.com`. Without this, Payhip's checkout hand-off restarts the session
   and every sale is credited to the wrong source.
3. Admin → Data settings → **Data filters** → internal traffic filter for your
   own IP, then set it to Active. The 15 test visits from 31 July are otherwise
   mixed into real data forever.
4. Verify with one controlled order — see `docs/PRODUCTION-VERIFICATION.md` §3.

These are account settings; the GA4 API available here is read-only reporting
and cannot change them.

## 4. Contact alerting

Set `CONTACT_NOTIFY_WEBHOOK_URL` in Vercel to any https endpoint that accepts
JSON — a Slack incoming webhook, a Zapier/Make catch hook, or an inbox relay.
Until it is set, answering `/contact.html` depends on remembering to open
MailerLite, while the page promises "a person reads these".

Then assign, in writing: who answers, and within how long.

## 5. Author credentials (blocks the E-E-A-T work)

Google applies its strictest quality standards to pages about death, health,
money, and legal documents. `about.html` currently names Joanne Godfrey and
Michael David and says little about why either is qualified to publish this.

Only the two of you can supply: relevant experience, what you did before this,
what the method was built from, and what you deliberately excluded. Nothing in
this repository can invent it, and inventing it is exactly the failure mode in
this category.

The structured data is already in place to carry it — `about.html` and the home
page both declare `Person` nodes ready for real detail.

## 6. The Essentials edition question

The traffic plan asks whether the $29 Essentials file is genuinely reduced
compared with Ultimate, or the same file sold twice. That is a refund and
reputation question, not a marketing one, and it needs someone to open both
files. If it is not genuinely reduced, hide the $29 card until it is.

## 7. Payhip has no sales API — confirmed

Checked through the connected Payhip integration on 2026-08-17: the available
endpoints are coupon management and webhook event schemas. There is no endpoint
that reads sales or products.

This is why revenue reporting goes through the webhook. It is not a workaround
to be replaced later — it is the only path there is.

---

## Order of operations

1. §1 MailerLite decision and rename — before any traffic.
2. §2 DKIM — before any traffic. Unauthenticated bulk mail is the one mistake
   here that takes months to undo.
3. §3 GA4 secret and the two settings — before spending anything on traffic,
   or you will be buying visits you cannot attribute.
4. §4 contact alerting — before promotion.
5. §5 credentials — before pitching podcasts or guest posts, whose first
   question is who you are.
6. §6 Essentials decision — before promoting the $29 tier.
