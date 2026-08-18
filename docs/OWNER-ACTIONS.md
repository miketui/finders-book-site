# Owner actions — what code cannot close

Everything in this file needs a human with an account login. Each item records
what was **verified live**, so the next person starts from evidence rather than
from the assumption in an older document.

## Status as of 2026-08-18

| Item | State | Evidence |
|---|---|---|
| §1 MailerLite automation naming | ✅ **done** | Both renamed to `Finder's Book — Essentials Onboarding` / `— Ultimate Onboarding`, still enabled; `Buyer Onboarding` still off, so no duplicate sends |
| §2 DKIM | ✅ **done** | `litesrv._domainkey.familyfindersbook.com` is a CNAME to `litesrv._domainkey.mlsend.com` and resolves to a valid key; mail-tester reports a valid DKIM signature |
| §3 GA4 Measurement Protocol secret in Vercel | ✅ **done** | `/api/health` reports `ga4_purchase_reporting: true` |
| §4 Contact alerting | ✅ **done** | `/api/health` reports `contact_owner_alert: true` |
| GA4 referral exclusions + internal-traffic filter | ✅ **done** | Confirmed by the owner in the GA4 UI on 2026-08-18. Not machine-verifiable here: the GA4 Data API connection is reporting-only, and Composio's GA4 connector returned 403 / an empty property list on Admin API reads |
| §5 Author credentials | ✅ **done** | Shipped on `/about.html` with `Person` structured data, PR #26 |
| §6 Essentials edition question | ✅ **resolved** | Essentials ships the two 49-page PDFs plus START_HERE/licence; Ultimate adds the bonus tools. Genuinely reduced — the $29 card stays |
| DMARC tightening to `p=quarantine` | ⏳ **not yet, deliberately** | See the note under §2 |

Everything below is the original detail, kept because it records how each item
was checked.

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

**Resolved 2026-08-18** — both were renamed and remain enabled; `Buyer Onboarding`
is still off. The original decision, kept for the record:

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
| **DKIM** | ✅ **present** at selector `litesrv` — a CNAME to `litesrv._domainkey.mlsend.com`. An earlier sweep of 22 guessed selectors missed it because `litesrv` was not among them |

**Corrections to the traffic plan:** it states there is no SPF, DKIM or DMARC
and that mail sends from a gmail.com address. SPF and DMARC exist, and the
automations send from `info@familyfindersbook.com`.

**Already done — do not redo these.** MailerLite domain authentication is in
place, the DKIM record is published at selector `litesrv`, and mail-tester
reports valid SPF and a valid DKIM signature (2026-08-18). Re-running the
authentication flow risks changing a working configuration.

~~1. MailerLite → Settings → Domains → authenticate the domain and publish the
DKIM record.~~ Superseded — done.
~~3. Confirm with mail-tester.~~ Superseded — done, passing.

**The one step that remains:**

Tighten DMARC from `p=none` to `p=quarantine` — but **only after** confirming
alignment in the `rua` reports. See the caveat below; doing this early can
quarantine legitimate mail.

One caveat before step 2 above (`p=quarantine`): the signature mail-tester
displayed was `d=mailerlite.com` with selector `litesrv`, and its `h=` list
includes `DKIM-Signature`, meaning it signs another signature — so the message
almost certainly carries two, and the aligned one was not the one shown. DMARC
only passes on an *aligned* signature (`d=familyfindersbook.com`) or an aligned
return-path. Read the `rua` aggregate reports arriving at info@ for a couple of
weeks and confirm alignment actually passes **before** tightening to
`p=quarantine`, or legitimate MailerLite mail could start being quarantined.

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

## What is actually left

Everything in the original list below was completed on 2026-08-18 except the
DMARC step. See the status table at the top of this file.

1. **Read the DMARC `rua` reports** arriving at info@familyfindersbook.com for a
   week or two, and confirm an *aligned* signature is passing. Only then tighten
   DMARC from `p=none` to `p=quarantine`.
2. **Run one controlled order** end to end and confirm exactly one deduplicated
   GA4 `purchase` with the correct value, currency and item — the last open P0
   from the audit. Steps are in `PRODUCTION-VERIFICATION.md` §3.

### Historical order (all complete except DMARC)

The sequence these were originally done in, kept because it records why each
came before the next:

1. ~~§1 MailerLite decision and rename~~ — before any traffic. **Done.**
2. ~~§2 DKIM~~ — before any traffic. Unauthenticated bulk mail is the one
   mistake here that takes months to undo. **Done** (DMARC tightening still
   pending, deliberately).
3. ~~§3 GA4 secret and the two settings~~ — before spending anything on
   traffic, or you will be buying visits you cannot attribute. **Done.**
4. ~~§4 contact alerting~~ — before promotion. **Done.**
5. ~~§5 credentials~~ — before pitching podcasts or guest posts, whose first
   question is who you are. **Done.**
6. ~~§6 Essentials decision~~ — before promoting the $29 tier. **Done** —
   genuinely a reduced edition, card stays.
