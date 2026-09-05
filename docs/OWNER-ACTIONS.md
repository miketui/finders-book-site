# Owner actions — what code cannot close

Everything in this file needs a human with an account login. Each item records
what was **verified live**, so the next person starts from evidence rather than
from the assumption in an older document.

## Production audit — Payhip still says 49 pages (2026-09-05)

The website on `main` (`83dfe67`) is honest: Ultimate is 250 pages; Essentials is
the 49-page 001–049 starter. **Payhip is not.** Live storefront copy for Ultimate
(`Y1O7B`) and Family Bundle (`xPuv4`) still says “49-page fillable PDF” and
“49-page printable PDF”. Essentials (`eHcPG`) 49-page copy is correct. Prices
are still $29 / $49 / $89. All three listings still show Payhip’s “On Sale”
badge.

This cannot be fixed in the repository. In the Payhip product editor, change
**description copy only** for Ultimate and Family to 250 pages. Do not change
slugs, ZIP files, webhook, or prices. Then read overlay and `/buy?link=Y1O7B`
because the iframe body comes from the dashboard, not from site JS.

Also open the enabled Ultimate / Family onboarding emails in MailerLite — they
were designed 2026-08-19, before the honesty pass, and may still say 49 pages.
Leave the two 2026-09-05 drafts (Gap Check PDF Opt-in, Day-7 Review + Upgrade)
disabled.

Full audit: [`docs/SITE-AUDIT-2026-09-05.md`](SITE-AUDIT-2026-09-05.md).

## Week 3 — Gap Check MailerLite hold (2026-09-05)

Site code now scores the Gap Check on the page. The optional “email me this score + the 1-page checklist” path is wired, but **MailerLite is not called** unless `GAP_CHECK_MAILERLITE_ENABLED=1` is set on the deployment. Do not flip that flag until CoS approves a live campaign. No MailerLite send was made in this work. The Day-7 review-ask / review-request incentive stays inactive and unscheduled (incentive TBD). Quote slots stay empty — do not invent reviews.

## Week 2 — Payhip overlay + `/start` (2026-09-05)

Site code now prefers in-page Payhip overlay checkout and ships a branded `/start` orientation page. **No Payhip admin setting was changed in this work.** See `docs/PAYHIP-OVERLAY.md`.

### APPROVAL NEEDED

| Setting | Why | What to type | Risk if flipped without reading |
|---|---|---|---|
| Checkout success redirect to `https://www.familyfindersbook.com/start.html` | Overlay `successUrl` is best-effort only. A reliable return to `/start` is a Payhip dashboard checkbox. | Account → Settings → Advanced Settings → Checkout Settings → redirect all three SKUs | Buyers lose the in-overlay instant download and must use the Payhip email. `/start` already says so. |
| Remove “On Sale” / compare-at price, if it still shows in overlay or `/buy` | Site CSS cannot restyle Payhip’s iframe. | Product editor for `eHcPG`, `Y1O7B`, `xPuv4` — clear sale/compare-at only. Keep $29 / $49 / $89. | Changing the actual price would disagree with the website. |
| Rename overlay titles if the iframe still disagrees | Site JS passes Essentials / Ultimate / Family Bundle titles. The iframe prints the dashboard product name. | Product editor titles: `The Finder's Book — Essentials`, `The Finder's Book — Ultimate`, `The Finder's Book — Family Bundle`. | Renaming slugs or files would break checkout and the webhook map. |

---

## Status as of 2026-08-18 — current AGM execution

| Item | State | Current evidence |
|---|---|---|
| MailerLite generic `Buyer Onboarding` | ⛔ **open / UI archive-or-rename required** | Fresh provider state: disabled, 0 sends, 0 queued. It still targets Essentials, Ultimate, and Family buyer groups, so an accidental re-enable would overlap the tier-specific workflows. The connected API exposes only permanent deletion for this workflow, not safe archive/disable/rename mutation; permanent deletion was deliberately not used. |
| MailerLite plaintext + visible postal footer | ⛔ **open / UI required** | Fresh provider snapshot: 18 enabled automation emails; 18/18 have unsubscribe URLs and good unsubscribe contrast; 0/18 have a preheader; 18/18 use MailerLite's generic plaintext fallback; 0/18 plaintext bodies contain the business postal address. The account company details do contain the postal address, but the supported API does not expose the custom HTML body for fresh footer proof and does not expose a non-destructive active-email edit action. |
| MailerLite Contact Acknowledgement | ⚠️ **code-side closed; provider housekeeping remains** | Fresh provider state: enabled, 0 sends, 0 queued. The production contact route no longer creates MailerLite subscribers or contact-group membership, so this automation is unreachable from the site. Archive/disable it in the MailerLite UI as housekeeping; do not make support contacts marketable merely to force an acknowledgement. |
| MailerLite Ultimate refund suppression | ⚠️ **current queue clean; automatic exit still to prove** | Ultimate Onboarding is enabled and has 0 subscribers queued. The prior refunded QA run is now `Canceled` with reason `subscriber-removed-from-queue` / manually removed. Current Essentials, Ultimate, and Family onboarding triggers exclude the Refunded group and use `exit_when_no_longer_matches=true`. The configuration is refund-safe, but the observed cancellation was manual; close the final C08 suppression proof only after a future controlled refund exits automatically. |
| DKIM / SPF | ✅ **done** | Existing DNS authentication is working; do not rerun domain authentication. |
| DMARC tightening | ⏳ **post-launch** | Remains `p=none`; inspect aggregate alignment before any protected DNS change. |
| GA4 Measurement Protocol config | ✅ **armed** | Vercel has the GA4 configuration keys and health reports the integration path; unit tests prove a 4900-cent Payhip payload maps to value 49 USD. |
| GA4 `checkout_click` / `lead_submit` key events | ✅ **verified 2026-08-18** | Current GA4 Admin API evidence for property `548125685` lists `purchase`, `checkout_click`, and `lead_submit` as key events/conversions. No mutation is required. |
| GA4 paid attribution + live revenue | ⚠️ **revenue proven; attribution code production-promoted** | The 2026-08-18 controlled discounted Ultimate purchase is processed as exactly 1 purchase / 1 transaction / **$2 USD** purchase and total revenue. Its original event remains `(not set)` for source/medium/campaign because it predates the fix. PR #43 is merged and production-promoted at `acd66489bbfe9d5b219f890731f3788aebe44632`: consented checkouts now carry the browser GA `client_id` + `session_id` through Payhip metadata into the Measurement Protocol purchase, with the synthetic fallback retained for non-consented/legacy orders. Close C04 only after a future real or safely authorized checkout proves processed source/medium/campaign attribution. |
| Contact owner alert | ⚠️ **code contract proven; live delivery still to prove** | `CONTACT_NOTIFY_WEBHOOK_URL` exists in production without exposing its value. The C12 branch makes this route authoritative: no MailerLite contact write occurs, success requires owner delivery, and missing/rejected routing returns a visitor-visible error with the support-email fallback. New acceptance tests pass 20/20; close only after one fresh production contact succeeds. |
| Essentials package distinction | ✅ **verified 2026-08-18** | Direct Payhip screenshots plus the exact matching ZIPs prove Essentials is genuinely reduced: 6 physical files vs 11 Ultimate vs 13 Family, no Ultimate bonus PDF leak, and all embedded checksums pass. Keep the $29 tier visible. See `docs/PAYHIP-PACKAGE-MATRIX.md`. |
| Payhip exact files / refund / analytics settings | ✅ **verified 2026-08-18 · C06 closed** | Direct dashboard screenshots verify GA4 `G-ZXX0M4VYT5`, download limit 5, visibility/prices, exact attached ZIP names/sizes, checkout/receipt settings, and All Customers subscription. Exact ZIPs were independently inspected and checksum-verified; customer-forwarded Essentials and Family archives matched canonical SHA-256 values exactly; Ultimate purchase/download/refund was exercised. The owner supplied the exact current canonical refund-policy text, confirming the 30-day covered-issue window, post-download change-of-mind rule, UK/EU pre-download cancellation rule, original-payment-method refund path, and licence termination after refund. See `docs/PAYHIP-PACKAGE-MATRIX.md`. |
| GTM Autopilot Phase 0 | ⛔ **open / owner billing required** | Phase 0 is halted at Section 12 (0/12 sections complete). Autopilot run #122 on `a9b6bf1` failed with OpenAI `429 insufficient_quota` / `credit_balance_exhausted` — the account behind the `OPENAI_API_KEY` secret has no credits. Every Phase 0 section is model-executed, so nothing advances until credits are added. State is intact and resumable; no spend occurred and no double-spend exposure exists. See `docs/GTM-PHASE0-RESUME.md`. |
| Browser automation | ⛔ **platform blocked** | Composio Browser Tool currently returns `temporarily disabled by the administrator`; UI-only GA4/MailerLite/Payhip work cannot be automated through it right now. |

**The detail below is retained as historical context. When it conflicts with the
current AGM table above or newer direct provider evidence, the newer evidence
wins.**

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

**All complete as of 2026-08-18 — do not redo.** `/api/health` reports
`ga4_purchase_reporting: true`, and the referral exclusions and internal-traffic
filter were confirmed in the GA4 UI by the owner.

~~1. Create the Measurement Protocol API secret and put it in Vercel as
`GA4_API_SECRET`, with the stream's `G-…` id as `GA4_MEASUREMENT_ID`.~~ Done.
~~2. List unwanted referrals: `familyfindersbook.com` and `payhip.com`.~~ Done.
~~3. Data filters → internal traffic filter, set to Active.~~ Done.

**Still outstanding:** step 4 — verify with one controlled order. See
`docs/PRODUCTION-VERIFICATION.md` §3. This is the audit's last open P0.

Why the settings above could not be machine-verified here, for the next person
who wonders: the GA4 connection available in this environment is the read-only
Data API, and Composio's GA4 connector returned 403 on `dataStreams.list` and an
empty property list on the Admin API, so neither could read account settings.

## 4. Contact alerting

**Complete as of 2026-08-18 — do not redo.** `/api/health` reports
`contact_owner_alert: true`, so `CONTACT_NOTIFY_WEBHOOK_URL` is set in Vercel
and inbound contact messages are being pushed to it.

~~Set `CONTACT_NOTIFY_WEBHOOK_URL` in Vercel to any https endpoint that accepts
JSON.~~ Done.

**Still worth doing, and not a config change:** assign in writing who answers
`/contact.html` messages and within how long. The page promises "a person reads
these"; an unowned promise is the failure mode here, not the plumbing.

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

### AGM execution update — PR #38 merged 2026-08-18

PR #38 (`Launch remediation: non-marketing support contact routing`) merged to protected `main` as `b0fa741fde2376c1ccd8615116f70e776ac3bd18`. Both required GitHub checks passed and Vercel promoted the exact merge commit to production. The live site contact route is therefore structurally decoupled from MailerLite marketing subscription. One fresh production contact submission is still required to close the owner-delivery acceptance proof; the legacy MailerLite Contact Acknowledgement can be archived as UI housekeeping and must not be made reachable by turning support contacts into marketing subscribers.

