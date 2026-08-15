# The Finder's Book launch-readiness report

Last updated: 2026-08-15

## 1. Executive Status

**NOT READY FOR LAUNCH**

The repaired branch is published in draft PR #12 and its Vercel preview built
successfully, but production is not ready. GitHub did not start either Actions
job because the account is locked for a billing issue; the protected preview
also redirects the generated share token to Vercel login. Payhip production
webhook settings cannot be read through the available connector, GA4 purchase
attribution is unverified, and the disabled MailerLite Gap Check workflow needs
its three designs restored plus suppression and exit logic before any
controlled email test.

## 2. Tool & Skill Usage

| Tool / skill | Available | Connected | Read | Write | Relevance | Planned or completed use | Result |
|---|---|---|---|---|---|---|---|
| GitHub app / GitHub skill | yes | yes (`miketui`) | yes | yes | required | Repository identity, branches, PRs, runs, remote publishing after gate | Draft PR #12 published; terminal cannot push; Actions billing-locked |
| Local files and shell | yes | yes | yes | local branch | required | Forensics, edits, tests, clean install, commits | working |
| Composio | yes | yes | yes | limited | required | Confirm historical GitHub path and inspect Payhip toolkit | GitHub/Payhip connections active |
| MailerLite app | yes | yes (account `2202141`) | yes | yes, limited | required | Groups, forms, automation configuration and dry runs | Live inventory complete; no sends or activation |
| Vercel app / verification skill | yes | yes | yes | deploy-capable | required | Project, domains, deployment, runtime errors, route responses | Preview at PR SHA is READY; production unchanged |
| Payhip through Composio | yes | yes (`payhip_hafter-rosoli`) | payload/coupon only | limited | required | Discover actual capability | Cannot read products, files, or webhook settings |
| Cloud browser | yes | yes | public pages | safe interactions | required | Production UI, Payhip pages/policy, PageSpeed | Public routes and products verified |
| Google PageSpeed / Lighthouse | public | n/a | yes | no | required | Mobile/desktop performance, accessibility, SEO | mobile 93/96/100/100; desktop 99/96/100/100 |
| GA4 Admin | no | no | no | no | required | Key Events, DebugView, Purchase | manual verification required |
| SEO audit skill | yes | n/a | yes | local fixes | required | Metadata, canonicals, sitemap, robots, schema, links | repository checks pass |
| Landing-page conversion skill | yes | n/a | yes | local fixes | required | Offer/CTA/trust/friction review | P0/P1 implementation defects repaired locally |
| Supabase plugin | yes | not used | n/a | n/a | not applicable | Confirm architecture does not use Supabase | AVAILABLE — NOT APPLICABLE |
| Claude shared conversation | public URL | blocked | no | no | requested context | Attempted direct review | Cloudflare challenge loop; not represented as reviewed |

## 3. Issues Found

| ID | Priority | Area | Issue | Root cause | Status |
|---|---|---|---|---|---|
| FB-001 | P0 | CI | `npm ci` failed on `main` | Playwright was duplicated at conflicting versions and missing from the lockfile | FIXED locally |
| FB-002 | P1 | Conversion | Order page requested three nonexistent 3D/poster assets | Progressive enhancement shipped before its assets | FIXED locally with real cover asset |
| FB-003 | P1 | Funnel | Purchase did not add All Customers or remove Leads | Webhook delegated lifecycle rules to disabled automations | FIXED locally |
| FB-004 | P1 | Refunds | Full refund only added Refunded; buyer/review groups remained | Cleanup existed only in a disabled workflow | FIXED locally |
| FB-005 | P1 | Analytics | About/order/contact did not load GA4 or Vercel page analytics | Telemetry head block existed only on home/policy pages | FIXED locally |
| FB-006 | P1 | Trust | Website support email differed from Payhip | Two historical support identities | FIXED on site; MailerLite reply-to remains manual |
| FB-007 | P1 | Accessibility | Header and featured tier failed contrast | Later CSS rules overrode intended dark backgrounds/colors | FIXED locally |
| FB-008 | P1 | Legal | No Terms page or footer link | Legal surface was incomplete | FIXED locally; professional review recommended |
| FB-009 | P2 | UX | Production used Vercel's generic 404 | No `404.html` | FIXED locally |
| FB-010 | P1 | MailerLite | Gap Check subjects were cyclically attached to the wrong designs | Workflow email metadata was created out of order | Subjects aligned; designs now require restoration |
| FB-011 | P1 | MailerLite | Subject-update connector replaced three designed records with undesigned records | Connector action recreated email records rather than editing metadata in place | FAIL / manual restoration required; workflow remains disabled |
| FB-012 | P1 | MailerLite | Lead workflow has no buyer/refund exclusions and no exit-on-removal | New workflow trigger is Leads only | FAIL / manual configuration required |
| FB-013 | P1 | MailerLite | Old and new onboarding/nurture generations overlap | New simplified workflows were created without retiring old drafts | FAIL / reconciliation required |
| FB-014 | P1 | MailerLite | Every automation is disabled | GO/activation intentionally remained off | BLOCKED until configuration and controlled test |
| FB-015 | P1 | Analytics | GA4 `Purchase` and Key Events are unverified | Checkout completes on Payhip and GA4 Admin is unavailable | MANUAL VERIFICATION REQUIRED |
| FB-016 | P1 | Payhip | Production webhook URL/events/secret and attached files cannot be read | Available Payhip connector lacks account/configuration reads | MANUAL VERIFICATION REQUIRED |
| FB-017 | P1 | Contact | Messages are stored in MailerLite but no verified internal support alert exists | No transactional email/queue notification provider | MANUAL VERIFICATION REQUIRED |
| FB-018 | P2 | Security | Obsolete `/api/subscribe` duplicated the lead endpoint | Earlier endpoint was retained after signed delivery was added | FIXED / endpoint removed |
| FB-019 | P2 | Security | Webhook token was optional and health shape could become public | Configuration treated the second factor as recommended | FIXED locally / fail closed |
| FB-020 | P2 | Dependencies | Local `npm audit` is blocked by workspace network policy | Audit command requires a network entitlement | Added production audit to CI; result pending |
| FB-021 | P2 | QA | Local Chromium install is blocked | Browser binary download requires unavailable network approval | CI render job expanded; result pending |
| FB-022 | P0 | CI | PR #12 Actions jobs never started | GitHub annotation: account locked due to a billing issue | BLOCKED BY EXTERNAL CONFIGURATION |
| FB-023 | P1 | Preview QA | Authenticated browser cannot open the protected preview | Generated Vercel share token redirects to Vercel login | MANUAL VERIFICATION REQUIRED |

## 4. Changes Made

### Dependency and CI repair

File/config: `package.json`, `package-lock.json`, `.github/workflows/validate.yml`

Before: Playwright `^1.62.1` in dependencies, `^1.49.0` in devDependencies,
and absent from the lockfile; CI installed a separately pinned browser CLI.

After: Playwright exists once in devDependencies at `^1.62.1`; lock resolves
Playwright/Core 1.62.1; CI uses the installed CLI and audits production dependencies.

Reason: restore reproducible `npm ci` and remove version drift.

Verification: clean `npm ci --ignore-scripts` passed.

### Purchase, refund, and health lifecycle

File/config: `api/payhip-webhook.js`, `api/health.js`, `.env.example`, tests

Before: tier-only purchases, flag-only refunds, optional webhook token, no
malformed JSON distinction, and incomplete health coverage.

After: purchase adds All Customers+tier and removes Leads/Refunded; full refund
adds Refunded and removes all buyer/review/lead groups; token is required;
malformed JSON is 400; health is GET-only and fails closed.

Reason: make lifecycle state independent of disabled email workflows.

Verification: 17 webhook and 6 health tests passed with mocked upstream calls.

### Lead capture and contact

File/config: `api/gap-check-subscribe.js`, `api/gap-check-download.js`,
`tests/test-gap-check.mjs`, removed `api/subscribe.js`

Before: duplicate endpoint remained, honeypot returned a valid download token,
and signed delivery had no dedicated tests.

After: one canonical endpoint, no bot token, 32-character secret floor, and
tests for signup, duplicate subscriber, PDF download, tamper, expiry, config,
method, validation, and rate limiting.

Reason: protect the top of funnel and prevent a silent repeat of the missing-freebie failure.

Verification: 15 Gap Check and 19 contact tests passed.

### Website, analytics, accessibility, and trust

File/config: public HTML, `chrome.css`, `pages.css`, `order.html`, `404.html`,
`terms.html`, sitemap, support fallbacks, CSP

Before: missing product media, telemetry gaps, contrast cascade errors, generic
404, no Terms page, and inconsistent support email.

After: real cover asset, telemetry on every public page, corrected header/tier
contrast, branded 404, Terms, one support address, modern frame-ancestor policy.

Reason: remove conversion, accessibility, attribution, and commerce-trust defects.

Verification: link/reference, CSP, HTML semantic, structured-data, secret, and
JavaScript syntax guards pass. Post-deployment Lighthouse rerun is pending.

### Regression coverage and documentation

File/config: validation scripts, desktop/mobile render suite, deployment/vendor
docs, `areas/finders-book.md`, this report

Before: render suite was desktop-only; local references checked three pages;
deployment docs used the Vercel alias and omitted the lead-token secret.

After: every page is checked; render suite covers 1280px and 390px, horizontal
overflow, touch target, nav open/Escape close, CLS, JS/HTTP errors, and no-GSAP;
the operational runbook records live IDs and approval boundaries.

Reason: make launch state repeatable and evidence-based.

Verification: static guards pass; Vercel preview build is READY. Browser
execution remains blocked by GitHub billing and Vercel preview SSO.

## 5. Git

```text
Repository: miketui/finders-book-site
Starting SHA: 3501434a75da221420c7c570d97af8dc90c85211
Working branch: codex/launch-readiness-repair
PR #11: merged; CURRENT
PR #12: open draft; 4 logical commits plus this evidence update
Branches reviewed: all remote branches
Merge candidates: this repair branch only
agent/launch-audit-fixes: SUPERSEDED / DO NOT MERGE
Final main SHA: not changed — approval required
Remote branch SHA: 49b5d8476e0aa9ffe76d2cfc17f872d08c3fdc5e before evidence update
CI: PR run 31878427877 FAIL — jobs not started; GitHub billing lock annotation
```

## 6. MailerLite

All workflows are disabled. No live email was sent and no automation was activated.

### Finder's Book — Gap Check Lead Nurture (`195847295840814845`)

```text
Trigger: joins Finder's Book — Leads
Steps: Email 1 -> 3 days -> Email 2 -> 4 days -> Email 3
Delays: verified 3 days / 4 days
Sender: Joanne and Michael
Suppression: none (must add All Customers and Refunded)
Refund logic: none
Review logic: not applicable
Current state: disabled, incomplete
Test result: dry run traverses five steps; live GET shows three undesigned records
Required action: restore designs, plaintext, preheaders, reply-to, exclusions, and exit logic
```

### Essentials Onboarding (`194226713836651864`)

```text
Trigger: joins Essentials Buyers
Steps: add All Customers; four emails with 2/5/14-day delays
Sender: Michael and Joanne
Suppression: no verified Refunded exit
Refund logic: webhook now removes trigger/customer groups
Review logic: final onboarding only
Current state: disabled; designed; historical sends exist
Test result: dry simulation passed
Required action: sender/reply-to/plaintext/refund-exit QA before controlled test
```

### Ultimate Onboarding (`194226725902616321`)

```text
Trigger: joins Ultimate Buyers
Steps: add All Customers; four emails with 2/5/14-day delays
Sender: Michael and Joanne
Suppression: no verified Refunded exit
Refund logic: webhook now removes trigger/customer groups
Review logic: final onboarding only
Current state: disabled; designed
Test result: dry simulation passed
Required action: sender/reply-to/plaintext/refund-exit QA before controlled test
```

### Family Onboarding (`194226731545004025`)

```text
Trigger: joins Family Bundle Buyers
Steps: add All Customers; four emails with 3/5/13-day delays
Sender: Michael and Joanne
Suppression: no verified Refunded exit
Refund logic: webhook now removes trigger/customer groups
Review logic: final onboarding only
Current state: disabled; designed
Test result: dry simulation passed
Required action: sender/reply-to/plaintext/refund-exit QA before controlled test
```

### Buyer Onboarding (`195847299585279235`)

```text
Trigger: joins any tier group
Steps: three generic emails, immediate/5 days/9 days
Sender: Joanne and Michael
Suppression: no refund exclusion
Refund logic: none in workflow
Review logic: none
Current state: disabled; designed
Test result: dry simulation passed
Required action: DO NOT activate beside tier-specific onboarding; choose one model
```

### Refund Handling (`194226711638836895`)

```text
Trigger: joins Refunded
Steps: removes All Customers, tier groups, Review Requested; sends one email
Sender: Michael and Joanne
Suppression: cleanup is present but now duplicated by webhook
Refund logic: explicit
Review logic: removes Review Requested
Current state: disabled; designed
Test result: dry simulation passed
Required action: decide whether a refund email is desired; do not rely on it for cleanup
```

### Review Request (`194226737309025696`)

```text
Trigger: joins All Customers, excluding Refunded at entry
Steps: 18 days -> email -> add Review Requested -> 14 days -> email
Sender: Michael and Joanne
Suppression: entry exclusion only; exit_when_no_longer_matches=false
Refund logic: webhook removes All Customers and Review Requested
Review logic: two-stage request, completion marker
Current state: disabled; designed
Test result: dry simulation passed
Required action: add an in-workflow Refunded condition/exit before each send
```

### Readiness Lead Nurture (`194226719223186795`)

```text
Trigger: joins Leads, excluding All Customers
Steps: five emails, 2/3/3/4-day delays, condition before final sales email
Sender: Michael and Joanne
Suppression: All Customers at entry plus one later condition
Refund logic: no explicit Refunded exclusion
Review logic: not applicable
Current state: disabled; designed; historical sends exist
Test result: dry simulation passed
Required action: supersede after the three-email Gap Check workflow is restored
```

### Contact Acknowledgement (`195847302637684408`)

```text
Trigger: joins any contact group
Steps: one acknowledgement email
Sender: Joanne and Michael
Suppression: contact-only groups; no Leads
Refund logic: not applicable
Review logic: not applicable
Current state: disabled; designed
Test result: dry simulation passed
Required action: reply-to/plaintext QA and a separate internal support-alert process
```

## 7. Payhip

- Essentials: `https://payhip.com/b/eHcPG`, $29, ZIP shown as 27 MB
- Ultimate: `https://payhip.com/b/Y1O7B`, $49, ZIP shown as 26 MB
- Family Bundle: `https://payhip.com/b/xPuv4`, $89, ZIP shown as 26 MB
- Titles, prices, contents, Buy Now/Add to Cart, and public refund policy: PASS
- Attached paid files: MANUAL VERIFICATION REQUIRED
- Checkout completion/live charge: not performed
- Webhook implementation and local simulations: PASS
- Production webhook dashboard settings and live refund: MANUAL VERIFICATION REQUIRED

## 8. Vercel

```text
Project: finders-book-v34 (prj_1LXLU5n3bvZSL3310dsGjwE3yuu0)
Production branch: main
Domain: https://www.familyfindersbook.com
Production deployment: dpl_DZeaArtRqNCWALSdcVYkD9fYaHAH — READY
Production commit: 3501434a75da221420c7c570d97af8dc90c85211
Preview deployment: dpl_AsnDZpQyFeNnMnoejdEkmPzmSTYB — READY
Preview commit: 49b5d8476e0aa9ffe76d2cfc17f872d08c3fdc5e
Environment: Production; secret names/values not exposed by connector
Health: public site 200; apex/http redirects 308; private health without token 401
```

Runtime errors in the last 30 days: a platform `url.parse()` deprecation warning
and one historical deployment missing MailerLite/Payhip keys. No current Payhip
processing error was returned in the 24-hour log window. The PR preview cloned
the exact review SHA, installed dependencies, completed its Vercel build, and
deployed without a build error. Route-level preview browsing remains unverified
because Vercel SSO rejected the generated temporary share URL.

## 9. Analytics

```text
GA4: G-ZXX0M4VYT5 — loader present on all repaired public pages
lead_submit: implemented after successful API response; GA4 receipt unverified
checkout_click: implemented for all protected Payhip CTAs; GA4 receipt unverified
Purchase: not implemented/verified across Payhip -> GA4
Key Events: GA4 Admin access unavailable; manual verification required
Vercel Web Analytics: loader present on all repaired public pages
```

## 10. Test Matrix

| Test | Status | Evidence | Notes |
|---|---|---|---|
| Homepage | PASS | live 200 and browser inspection | current production SHA |
| Mobile homepage | PASS | live PageSpeed mobile render, score 93 | repaired branch still needs protected-preview rerun |
| Navigation | MANUAL VERIFICATION REQUIRED | desktop live checked; mobile CI test added | blocked by preview SSO/CI billing |
| Lead form validation | PASS | 15 local Gap Check tests | mocked MailerLite |
| Lead form submission | MANUAL VERIFICATION REQUIRED | local API path passes | real subscriber requires controlled approval |
| MailerLite subscriber | MANUAL VERIFICATION REQUIRED | Leads contains active API subscribers | no new test subscriber created |
| Lead group | PASS | group ID and routing test | default live ID verified |
| Lead automation eligibility | FAIL | workflow disabled/incomplete | DOI setting also needs confirmation |
| Lead Email 1 | FAIL | replacement record is undesigned | restore before test |
| Lead magnet download | PASS | token, PDF, tamper, expiry tests | live valid-token test pending deploy |
| Essentials CTA | PASS | live Payhip page $29 | `eHcPG` |
| Ultimate CTA | PASS | live Payhip page $49 | `Y1O7B`, capital O |
| Bundle CTA | PASS | live Payhip page $89 | `xPuv4` |
| Payhip checkout | PASS | public Add to Cart/Buy Now present | no live charge |
| `checkout_click` | MANUAL VERIFICATION REQUIRED | code and CTA coverage pass | verify GA4 DebugView |
| Purchase webhook simulation | PASS | paid/security/malformed tests | no external mutation |
| Buyer segmentation | PASS | All Customers+tier asserted | local mock |
| Buyer nurture suppression | FAIL | Leads removal fixed; workflow exit missing | configure MailerLite |
| Refund simulation | PASS | full/partial tests | local mock |
| Review suppression | FAIL | group cleanup fixed; workflow in-flight condition missing | configure MailerLite |
| Contact form | PASS | 19 server routing/abuse tests; live route 405 on GET | internal alert remains manual |
| Privacy | PASS | live 200 and policy inspection | support address repaired locally |
| Terms | FIXED | new local page and links | not deployed |
| Refund policy | PASS | website and Payhip policy agree materially | support address repaired locally |
| 404 | FIXED | custom local page | not deployed |
| Sitemap | PASS | live 200; local includes Terms | deploy pending |
| Robots | PASS | live 200, correct sitemap | — |
| Structured data | PASS | JSON parse guard and Lighthouse SEO 100 | no fabricated ratings |
| Lint | NOT APPLICABLE | no linter configured | syntax/semantic guards used |
| Typecheck | NOT APPLICABLE | plain JavaScript project | all JS/MJS passes `node --check` |
| Tests | PASS | 57 unit/integration assertions | mocked external mutations |
| Production build | NOT APPLICABLE | static project, Vercel buildCommand null | clean install and validation are gate |
| Render test | BLOCKED | local Chromium unavailable; remote job never started | GitHub account billing lock |
| CI | BLOCKED | PR run `31878427877`, both annotations cite billing lock | no runner steps executed |
| Vercel deployment health | PASS | production and PR preview deployments READY | preview route inspection blocked by SSO |

## 11. Remaining Manual Actions

### MAILERLITE — restore and reconcile the Gap Check workflow

`MailerLite -> Automations -> Finder's Book — Gap Check Lead Nurture -> Edit`

1. Restore the three HTML designs using the retained screenshots/brand template.
2. Confirm order: Gap Check delivery -> 3 days -> completion objection -> 4 days -> gap/offer message.
3. Set sender `Joanne and Michael` and reply-to `info@michaeldavidjr.beauty`.
4. Add useful preheaders and real plaintext versions.
5. Exclude All Customers and Refunded and exit when a subscriber leaves Leads,
   or insert equivalent conditions before Emails 2 and 3.
6. Keep GO off.

Expected result: automation is complete, unbroken, three emails designed, no
buyer/refunded subscriber qualifies. Verify with a dry run, then request the
controlled-test activation gate.

### MAILERLITE — API double opt-in

`MailerLite -> Account settings -> Subscribe settings -> Double opt-in for API and integrations`

Verify it is ON, the confirmation sender/domain is valid, and the confirmation
copy accurately covers the Gap Check plus the nurture series. Submit only a
controlled test address after approval. Expected result: new API subscriber is
Unconfirmed, receives one confirmation, becomes Active after clicking, and can
then enter the Leads workflow.

### MAILERLITE — workflow consolidation

`MailerLite -> Automations`

Choose the three-email Gap Check flow over the old five-email Readiness flow;
choose tier-specific onboarding over generic Buyer Onboarding. Keep the
superseded workflows disabled. Add Refunded exit conditions to onboarding and
review flows. Expected result: one trigger path per lifecycle stage.

### PAYHIP — products and webhook

`Payhip -> Products` and `Payhip -> Settings -> Developer -> Webhooks`

Verify each product has the correct current ZIP and license, then configure the
production endpoint as
`https://www.familyfindersbook.com/api/payhip-webhook?t=<private token>` for paid
and refunded events. Expected result: a controlled signed payload receives 200,
segments once, and a full refund cleans every buyer/review group.

### VERCEL — environment and abuse controls

`Vercel -> finders-book-v34 -> Settings -> Environment Variables`

Verify the four required names exist for Production, then redeploy the approved
commit and call the private health URL. In Firewall, add route-specific rate
limits for `/api/contact` and `/api/gap-check-subscribe` if the plan supports
them. Expected result: health reports all four as present without exposing values.

### GA4 — events and attribution

`GA4 -> Admin -> DebugView / Events / Key Events` and `Payhip -> Marketing/Analytics`

Verify one controlled `lead_submit`, one `checkout_click`, and a non-live/test
purchase path where Payhip supports it. Prevent duplicate Purchase events, add
campaign parameters, and mark genuine conversions as Key Events. Expected
result: source/medium/campaign persists from landing through purchase.

### CONTACT — operational alert

Choose a support inbox/transactional provider or a monitored MailerLite queue
that alerts `info@michaeldavidjr.beauty` when a contact group receives a new
message. Expected result: a controlled contact receives acknowledgement and an
internal owner sees the message without polling the subscriber list.

### GITHUB — restore Actions execution

`GitHub -> Settings -> Billing and licensing -> Payment information / Actions`

Resolve the account billing lock, then re-run failed jobs for workflow run
`31878427877`. Expected result: both `Static validation` and
`Rendered-page smoke test` receive runners, execute steps, and finish green.
Verify that the job pages contain normal step logs rather than the billing-lock
annotation.

### VERCEL — allow controlled preview verification

`Vercel -> finders-book-v34 -> Settings -> Deployment Protection`

Generate a working temporary share link for preview deployment
`dpl_AsnDZpQyFeNnMnoejdEkmPzmSTYB`, or authenticate a browser session without
weakening production protection. Expected result: the exact preview SHA can be
checked at desktop/mobile widths without exposing the deployment publicly.

## 12. Approval Gates

### APPROVAL GATE — MERGE TO MAIN

DO NOT MERGE yet. Draft PR #12 is published and the Vercel preview build is
READY, but remote CI/render did not execute because of the GitHub billing lock.
After billing is resolved, rerun workflow `31878427877` and review the protected
preview. Merging `main` is expected to trigger Vercel production.

### APPROVAL GATE — MAILERLITE ACTIVATION

Not ready to request. Designs, suppression, exit logic, sender/reply-to,
plaintext, preheaders, DOI, and the test-subscriber isolation plan must pass first.

## 13. Launch Blockers

- P0: GitHub account billing lock prevents all Actions jobs from starting.
- P1: repaired code has not passed remote rendered-page audit or reached production.
- P1: the Gap Check automation's three designs are incomplete and suppression/exit logic is absent.
- P1: overlapping MailerLite nurture/onboarding workflows are not reconciled.
- P1: production Payhip webhook configuration and attached files are not verified.
- P1: GA4 Purchase attribution and Key Events are not verified.
- P1: no internal contact-message alert or documented polling owner is verified.

## 14. Final Checklist

### Repository

- [x] correct repository confirmed
- [x] GitHub read/write mechanism determined
- [x] secret scan complete
- [x] branch/PR inventory complete
- [x] PR #11 reviewed
- [x] merge plan prepared
- [x] remote repair branch and draft PR #12
- [ ] GitHub billing restored and remote CI pass
- [ ] merge approved
- [ ] final main SHA verified

### Engineering and website

- [x] clean dependency install
- [x] JS syntax and static validation
- [x] 57 local API assertions
- [x] public routes and CTAs inspected
- [x] SEO/structured-data checks
- [x] accessibility defects repaired locally
- [x] performance baseline recorded
- [ ] remote desktop/mobile render suite
- [x] repaired Vercel preview build READY
- [ ] protected preview route/mobile verification
- [ ] production verification after approved merge

### Funnel and services

- [x] lead endpoint and signed download tests
- [x] purchase/refund lifecycle tests
- [x] Payhip public products/prices/policy
- [x] MailerLite groups and all nine workflows inventoried
- [ ] Gap Check designs restored
- [ ] buyer/refund exits configured
- [ ] one onboarding/nurture generation chosen
- [ ] Payhip webhook dashboard verified
- [ ] controlled lead/purchase/refund/review test
- [ ] GA4 Purchase/Key Events verified
- [ ] MailerLite activation approved

### Documentation

- [x] `areas/finders-book.md`
- [x] architecture and integration map
- [x] deployment and troubleshooting runbook
- [x] persistent launch-readiness report
