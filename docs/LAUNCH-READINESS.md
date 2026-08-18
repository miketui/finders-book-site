# The Finder's Book launch-readiness report

Last updated: 2026-08-15

## 1. Executive Status

**READY FOR CONTROLLED SOFT LAUNCH (STEP 9)**

The Family purchase gate is PASS. A fresh Payhip Family order completed, the
production webhook returned 200, MailerLite segmentation was exact, Family
onboarding and Review Request were activated for new subscribers only, all five
QA coupons were removed, and the Payhip support address was corrected across
three product descriptions plus both refund-policy references. Full launch
reporting still requires GA4 Key Event and Search Console verification.

## 2. Tool & Skill Usage

| Tool / skill | Available | Connected | Read | Write | Relevance | Planned or completed use | Result |
|---|---|---|---|---|---|---|---|
| GitHub app / GitHub skill | yes | yes (`miketui`) | yes | yes | required | Repository identity, branches, PRs, runs, automated review, remote publishing after gate | PRs #12-#14 merged; PR #15 green and approved |
| Local files and shell | yes | yes | yes | local branch | required | Forensics, edits, tests, clean install, commits | complete |
| Composio | yes | yes | yes | limited | required | Confirm historical GitHub path and inspect Payhip toolkit | GitHub/Payhip connections active |
| MailerLite app and authenticated browser | yes | yes (account `2202141`) | yes | yes | required | Domain, sender, groups, campaigns, automation configuration, dry runs and approved activation | Family and Review active for new subscribers only; controlled Family segmentation passed |
| Vercel app / verification skill | yes | yes | yes | deploy-capable | required | Project, domains, deployment, runtime errors, route responses | final `main` deployment READY and route-verified |
| Payhip through Composio | yes | yes (`payhip_hafter-rosoli`) | payload/coupon only | limited | required | Discover actual capability | Cannot read products, files, or webhook settings |
| Cloud browser | yes | yes | authenticated dashboard and public pages | approved interactions | required | Payhip products, policy, checkout, order ledger, coupons, and MailerLite activation | Family QA passed; support copy corrected; QA coupons removed; workflows activated |
| Google PageSpeed / Lighthouse | public | n/a | yes | no | required | Mobile/desktop performance, accessibility, SEO | mobile 93/96/100/100; desktop 99/96/100/100 |
| GA4 Admin | no | no | no | no | required | Key Events, DebugView, Purchase | manual verification required |
| SEO audit skill | yes | n/a | yes | local fixes | required | Metadata, canonicals, sitemap, robots, schema, links | repository checks pass |
| Landing-page conversion skill | yes | n/a | yes | local fixes | required | Offer/CTA/trust/friction review | P0/P1 implementation defects repaired locally |
| Supabase plugin | yes | not used | n/a | n/a | not applicable | Confirm architecture does not use Supabase | AVAILABLE — NOT APPLICABLE |
| Claude shared conversation | public URL | blocked | no | no | requested context | Attempted direct review | Cloudflare challenge loop; not represented as reviewed |

## 3. Issues Found

| ID | Priority | Area | Issue | Root cause | Status |
|---|---|---|---|---|---|
| FB-001 | P0 | CI | `npm ci` failed on `main` | Playwright was duplicated at conflicting versions and missing from the lockfile | FIXED / CI PASS |
| FB-002 | P1 | Conversion | Order page requested three nonexistent 3D/poster assets | Progressive enhancement shipped before its assets | FIXED locally with real cover asset |
| FB-003 | P1 | Funnel | Purchase did not add All Customers or remove Leads | Webhook delegated lifecycle rules to disabled automations | FIXED locally |
| FB-004 | P1 | Refunds | Full refund only added Refunded; buyer/review groups remained | Cleanup existed only in a disabled workflow | FIXED locally |
| FB-005 | P1 | Analytics | About/order/contact did not load GA4 or Vercel page analytics | Telemetry head block existed only on home/policy pages | FIXED locally |
| FB-006 | P1 | Trust | Website and email sender identities differed | Historical support/login identities leaked into public copy and reply-to settings | FIXED in site, 27 automation steps, two campaign drafts, and account defaults |
| FB-007 | P1 | Accessibility | Header and featured tier failed contrast | Later CSS rules overrode intended dark backgrounds/colors | FIXED locally |
| FB-008 | P1 | Legal | No Terms page or footer link | Legal surface was incomplete | FIXED locally; professional review recommended |
| FB-009 | P2 | UX | Production used Vercel's generic 404 | No `404.html` | FIXED locally |
| FB-010 | P1 | MailerLite | Gap Check subjects were cyclically attached to the wrong designs | Workflow email metadata was created out of order | FIXED; dry run reports all three designs present, but MailerLite still flags the steps for editor completion review |
| FB-011 | P1 | MailerLite | Subject-update connector replaced three designed records with undesigned records | Connector action recreated email records rather than editing metadata in place | FIXED through the MailerLite editor; retained as an operational warning |
| FB-012 | P1 | MailerLite | Lead workflow has no buyer/refund exclusions and no exit-on-removal | New workflow trigger is Leads only | FAIL / manual configuration required |
| FB-013 | P1 | MailerLite | Old and new onboarding/nurture generations overlap | New simplified workflows were created without retiring old drafts | FAIL / reconciliation required |
| FB-014 | P1 | MailerLite | Required lifecycle automations were disabled | Activation intentionally remained gated | RESOLVED for Family Onboarding and Review Request; active for new subscribers only |
| FB-015 | P1 | Analytics | GA4 `Purchase` and Key Events are unverified | Checkout completes on Payhip and GA4 Admin is unavailable | MANUAL VERIFICATION REQUIRED |
| FB-016 | P1 | Payhip | Production purchase-webhook path was unproven | No successful live event had been observed | RESOLVED; controlled Family order returned webhook 200 and exact MailerLite routing |
| FB-017 | P1 | Contact | Messages are stored in MailerLite but no verified internal support alert exists | No transactional email/queue notification provider | MANUAL VERIFICATION REQUIRED |
| FB-018 | P2 | Security | Obsolete `/api/subscribe` duplicated the lead endpoint | Earlier endpoint was retained after signed delivery was added | FIXED / endpoint removed |
| FB-019 | P2 | Security | Webhook token was optional and health shape could become public | Configuration treated the second factor as recommended | FIXED locally / fail closed |
| FB-020 | P2 | Dependencies | Local `npm audit` is blocked by workspace network policy | Audit command requires a network entitlement | FIXED / production dependency audit PASS in CI |
| FB-021 | P2 | QA | Local Chromium install is blocked | Browser binary download requires unavailable network approval | FIXED / GitHub Chromium render job PASS |
| FB-022 | P0 | CI | PR #12 Actions jobs initially never started | GitHub account billing lock | RESOLVED; rerun executed normally |
| FB-023 | P1 | Preview QA | Protected preview could not be opened in the available browser | Preview authentication boundary | RESOLVED by green PR render CI plus final public production verification |
| FB-024 | P1 | Privacy | GA4 and Vercel Analytics loaded before any recorded consent | Telemetry was embedded directly in every page head | FIXED locally with equal allow/decline and withdrawal controls |
| FB-025 | P1 | Webhook | Non-404 MailerLite group-removal errors still returned 200 | Removal helper logged failures instead of propagating them | FIXED locally; 5xx now returns retryable 500 |
| FB-026 | P1 | Refunds | A refund removed unrelated product tiers and broad customer status | Handler broadcast cleanup to every buyer group | FIXED locally with item-scoped tier cleanup and retained historical customer state |
| FB-027 | P2 | Privacy | Public runbook recorded a personal authentication email | Operational notes copied an account login into repository docs | FIXED locally; only account ID and public reply-to remain |
| FB-028 | P2 | Documentation | Vendor map implied the Gap Check nurture was operating | Diagram omitted disabled/incomplete state | FIXED locally |
| FB-029 | P2 | Security QA | CSP test did not assert `frame-ancestors 'self'` | Test focused on script hashes and telemetry only | FIXED locally |
| FB-030 | P2 | Accessibility QA | Escape test checked ARIA state but not actual drawer visibility | Regression assertion stopped at `aria-expanded` | FIXED locally |
| FB-031 | P2 | 404 | Nested missing routes resolved 404 assets relative to the missing path | Error-page assets used document-relative URLs | FIXED locally with root-relative assets and nested-route render coverage |
| FB-032 | P1 | Accessibility | Featured Ultimate price and CTA blended into its pine card | Later `pages.css` rules overrode the dark-card contrast | FIXED locally with explicit featured-card overrides |
| FB-033 | P2 | Accessibility | Mobile 404 menu icon inherited pine on a pine hero | Over-hero toggle set only border, not foreground | FIXED locally for transparent and solid header states |
| FB-034 | P1 | Mobile QA | Closed drawer created 343px document overflow on home and terms | Transformed off-canvas fixed drawer contributed to root scroll width | FIXED / PR #13 render CI PASS / deployed |
| FB-035 | P2 | Render QA | 404 test required a mobile-only toggle on desktop | Viewport-specific assertion was not scoped | FIXED / PR #13 render CI PASS |
| FB-036 | P1 | Identity | Public support address and MailerLite sender/reply-to were inconsistent | Legacy addresses remained across repository, Payhip, and drafts | FIXED / Payhip public pages, MailerLite dry runs, and repository guard verified |

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

After: purchase adds All Customers+tier and removes Leads/Refunded; a full
refund adds Refunded, removes only the refunded tier(s), preserves unrelated
tiers and historical All Customers state, and removes review/lead membership.
Removal failures return 500 for Payhip retry; token is required; malformed JSON
is 400; unknown products fail loudly; health is GET-only and fails closed.

Reason: make lifecycle state independent of disabled email workflows.

Verification: 21 webhook and 6 health tests passed with mocked upstream calls.

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

File/config: public HTML, `consent.js`, `consent.css`, `analytics.js`,
`chrome.css`, `pages.css`, `order.html`, `404.html`, `terms.html`, sitemap,
support fallbacks, CSP

Before: missing product media, telemetry gaps, GA4/Vercel loading before
recorded consent, contrast cascade errors, generic 404, no Terms page, and
inconsistent support email.

After: real cover asset; optional analytics gated behind equal allow/decline
controls with withdrawal; corrected header/tier/CTA contrast; a branded 404
whose assets work at nested missing URLs and whose mobile toggle remains
visible; Terms; one support address; modern frame-ancestor policy and a
regression assertion.

Reason: remove conversion, accessibility, attribution, and commerce-trust defects.

Verification: link/reference, CSP, HTML semantic, structured-data, secret, and
JavaScript syntax guards pass. Post-deployment Lighthouse rerun is pending.

### Regression coverage and documentation

File/config: validation scripts, desktop/mobile render suite, deployment/vendor
docs, `areas/finders-book.md`, this report

Before: render suite was desktop-only; local references checked three pages;
deployment docs used the Vercel alias and omitted the lead-token secret.

After: every page is checked; render suite covers 1280px and 390px, horizontal
overflow, touch target, nav open/visible Escape close, analytics consent and
withdrawal, CLS, JS/HTTP errors, and no-GSAP; the operational runbook records
live IDs and approval boundaries without authentication identities.

Reason: make launch state repeatable and evidence-based.

Verification: static guards pass; PR #13 workflow `31880730311` passed both
Static validation and Rendered-page smoke test. Final production deployment is
READY and serves the merged CSS overflow repair.

### Support and sender identity

File/config: public HTML/JavaScript, `.env.example`, MailerLite account defaults,
all 27 automation email steps, and both draft campaigns

Before: three legacy or misspelled addresses could appear in public copy or
email settings; MailerLite draft campaigns replied to the historical login.

After: the public support address, From address, and Reply-to are
`info@familyfindersbook.com`; the From name is `Joanne and Michael`; the sending
domain is authenticated. The two placeholder campaigns remain unscheduled and
undesigned. All nine automations remain disabled.

Reason: establish one monitored, domain-authenticated customer identity without
starting live campaigns.

Verification: repository regression guard rejects all legacy/typo variants;
MailerLite dry runs report all 27 steps with the canonical From identity; every
step's custom Reply-to override is off; both campaigns return the canonical
From and Reply-to through the API. Exactly one Contact Acknowledgement test,
subject `We have your message`, was queued to the support inbox on 2026-08-15.

## 5. Git

```text
Repository: miketui/finders-book-site
Starting SHA: 3501434a75da221420c7c570d97af8dc90c85211
PR #15 base SHA: 50ce4aba01257b38a6b346f1cc0f3eadfac8085a
Working branch: agent/update-support-email
PR #11: merged; CURRENT
PR #12: merged
PR #13: merged after rendered-page CI repair
PR #14: merged; final launch-readiness runbook
PR #15: approved; support/sender identity and final operating instructions
Branches reviewed: all remote branches
Merge candidates: none remaining
agent/launch-audit-fixes: SUPERSEDED / DO NOT MERGE
Pre-PR #15 main SHA: 50ce4aba01257b38a6b346f1cc0f3eadfac8085a
CI: PR #15 workflow 31885939317 PASS before the runbook-only follow-up; final rerun required before merge
```

## 6. MailerLite

Sending domain `familyfindersbook.com` is authenticated. The account default and
all 27 automation email steps use `Joanne and Michael` with From/Reply-to
`info@familyfindersbook.com`. Both placeholder campaigns use the same identity
and remain drafts with no content. Exactly one approved Contact Acknowledgement
test was queued to the support inbox; no automation was activated. All nine
workflows remain disabled.

### Finder's Book — Gap Check Lead Nurture (`195847295840814845`)

```text
Trigger: joins Finder's Book — Leads
Steps: Email 1 -> 3 days -> Email 2 -> 4 days -> Email 3
Delays: verified 3 days / 4 days
Sender: Joanne and Michael
Suppression: none (must add All Customers and Refunded)
Refund logic: none
Review logic: not applicable
Current state: disabled; all three designs reported present, but editor-completion warnings remain
Test result: dry run traverses five steps; 3 designed / 0 undesigned; canonical sender verified
Required action: clear completion warnings, verify plaintext/preheaders, and add exclusions/exit logic
```

### Essentials Onboarding (`194226713836651864`)

```text
Trigger: joins Essentials Buyers
Steps: add All Customers; four emails with 2/5/14-day delays
Sender: Joanne and Michael <info@familyfindersbook.com>
Suppression: no verified Refunded exit
Refund logic: webhook now removes trigger/customer groups
Review logic: final onboarding only
Current state: disabled; designed; historical sends exist
Test result: dry simulation passed
Required action: plaintext/preheader/refund-exit QA before controlled test
```

### Ultimate Onboarding (`194226725902616321`)

```text
Trigger: joins Ultimate Buyers
Steps: add All Customers; four emails with 2/5/14-day delays
Sender: Joanne and Michael <info@familyfindersbook.com>
Suppression: no verified Refunded exit
Refund logic: webhook now removes trigger/customer groups
Review logic: final onboarding only
Current state: disabled; designed
Test result: dry simulation passed
Required action: plaintext/preheader/refund-exit QA before controlled test
```

### Family Onboarding (`194226731545004025`)

```text
Trigger: joins Family Bundle Buyers
Steps: add All Customers; four emails with 3/5/13-day delays
Sender: Joanne and Michael <info@familyfindersbook.com>
Suppression: no verified Refunded exit
Refund logic: webhook now removes trigger/customer groups
Review logic: final onboarding only
Current state: disabled; designed
Test result: dry simulation passed
Required action: plaintext/preheader/refund-exit QA before controlled test
```

### Buyer Onboarding (`195847299585279235`)

```text
Trigger: joins any tier group
Steps: three generic emails, immediate/5 days/9 days
Sender: Joanne and Michael <info@familyfindersbook.com>
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
Sender: Joanne and Michael <info@familyfindersbook.com>
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
Sender: Joanne and Michael <info@familyfindersbook.com>
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
Sender: Joanne and Michael <info@familyfindersbook.com>
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
Sender: Joanne and Michael <info@familyfindersbook.com>
Suppression: contact-only groups; no Leads
Refund logic: not applicable
Review logic: not applicable
Current state: disabled; designed
Test result: dry simulation passed; exactly one test email queued to info@familyfindersbook.com
Required action: confirm inbox delivery/content and add a separate internal support-alert process
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
Production deployment: dpl_3kDXUFo6RNxCQCaWDX81crBTVg8t — READY
Production commit: f7149bfb24bf87e58529a5571ab8efb00d794b05
PR #13 preview deployment: dpl_J4mvsEFgJwrPLLWqWedahfKzcp9d — READY
PR #13 preview commit: 98cb2ab2e6046d40917dd1097a3e61e653bb1175
Environment: Production; connector does not expose secret names/values
Health: public site 200; apex/http redirects 308; private health without token 401
```

Runtime observation: Vercel reports a platform `url.parse()` deprecation warning
on serverless requests; repository code does not call `url.parse()`. No current
Payhip processing error was observed. Final production returned expected 200,
401, 404, and 405 responses, and public routes carry HSTS and the intended CSP.

## 9. Analytics

```text
GA4: G-ZXX0M4VYT5 — loaded by consent.js only after explicit allow
Analytics consent: equal allow/decline, remembered preference, reopen/withdraw control
lead_submit: implemented after successful API response and consent; GA4 receipt unverified
checkout_click: implemented for all protected Payhip CTAs after consent; GA4 receipt unverified
Purchase: not implemented/verified across Payhip -> GA4
Key Events: GA4 Admin access unavailable; manual verification required
Vercel Web Analytics: loaded by consent.js only after explicit allow
```

## 10. Test Matrix

| Test | Status | Evidence | Notes |
|---|---|---|---|
| Homepage | PASS | live 200 and browser inspection | current production SHA |
| Mobile homepage | PASS | GitHub Chromium 390x844 render plus live PageSpeed mobile 93 | no horizontal overflow |
| Navigation | PASS | desktop live plus mobile open/Escape-close CI | 44x44 touch target |
| Analytics consent | PASS | 6 static assertions, browser allow/decline/withdraw, CI provider-request guard | no provider before consent |
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
| Privacy | PASS | live 200, consent/static guards, CSP/HSTS | deployed |
| Terms | PASS | live 200 and render CI | deployed |
| Refund policy | PASS | website and Payhip policy agree materially | support address repaired locally |
| 404 | PASS | live nested 404, root asset 200, desktop/mobile CI | deployed |
| Sitemap | PASS | live 200, 12 canonical routes, generated by `npm run sitemap` | submitted to Search Console 2026-08-18, 12 URLs read |
| Robots | PASS | live 200, correct sitemap | — |
| Structured data | PASS | JSON parse guard and Lighthouse SEO 100 | no fabricated ratings |
| Lint | NOT APPLICABLE | no linter configured | syntax/semantic guards used |
| Typecheck | NOT APPLICABLE | plain JavaScript project | all JS/MJS passes `node --check` |
| Tests | PASS | 67 unit/integration/static assertions | mocked external mutations; consent providers not contacted |
| Production build | NOT APPLICABLE | static project, Vercel buildCommand null | clean install and validation are gate |
| Render test | PASS | PR #13 workflow `31880730311` | desktop/mobile, nav, consent, CLS, JS/HTTP, overflow, no-GSAP |
| CI | PASS | static and rendered jobs green | billing blocker resolved |
| Vercel deployment health | PASS | production deployment READY at final main SHA | public routes reverified |

## 11. Remaining Manual Actions

### MAILERLITE — finish and reconcile the Gap Check workflow

`MailerLite -> Automations -> Finder's Book — Gap Check Lead Nurture -> Edit`

1. Open each email and clear MailerLite's “step not marked complete” warning;
   all three records currently report designed, so do not recreate them.
2. Confirm order: Gap Check delivery -> 3 days -> completion objection -> 4 days -> gap/offer message.
3. Confirm the already-saved sender is `Joanne and Michael` and From/Reply-to is
   `info@familyfindersbook.com`; the custom Reply-to checkbox should remain off.
4. Add useful preheaders and real plaintext versions.
5. Exclude All Customers and Refunded and exit when a subscriber leaves Leads,
   or insert equivalent conditions before Emails 2 and 3.
6. Keep GO off.

Expected result: automation is complete and unbroken, all three emails are
designed, and no buyer/refunded subscriber qualifies. Verify with a dry run,
then request the controlled-test activation gate.

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

### MAILERLITE — recommended activation order after all checks pass

Do not activate all nine workflows. The recommended live set is:

1. `Contact Acknowledgement` (`195847302637684408`) after the queued test is
   received and its content/reply behavior is approved.
2. `Gap Check Lead Nurture` (`195847295840814845`) after API double opt-in,
   All Customers/Refunded exclusions, leave-Leads exit behavior, completion
   warnings, links, plaintext, and preheaders pass.
3. `Essentials Onboarding` (`194226713836651864`), `Ultimate Onboarding`
   (`194226725902616321`), and `Family Bundle Onboarding`
   (`194226731545004025`) only after controlled purchase payloads put the test
   buyer into exactly one tier plus All Customers and refund exits are present.
4. `Review Request` (`194226737309025696`) only after a Refunded condition is
   checked immediately before each email and duplicate Review Requested entry is
   prevented.
5. `Refund Handling` (`194226711638836895`) only if a customer-facing refund
   message is desired; keep group cleanup in the tested webhook, not dependent on
   this workflow.

Keep `Readiness Lead Nurture` (`194226719223186795`) disabled because the
three-email Gap Check flow supersedes it. Keep generic `Buyer Onboarding`
(`195847299585279235`) disabled because the tier-specific onboarding workflows
supersede it. Activate one workflow at a time, add only the approved test address
to its trigger group, verify expected mail/activity, remove the test address,
then wait for a separate explicit production-activation approval before exposing
real subscribers.

### PAYHIP — products and webhook

`Payhip -> Products` and `Payhip -> Settings -> Developer -> Webhooks`

Verify each product has the correct current ZIP and license, then configure the
production endpoint as
`https://www.familyfindersbook.com/api/payhip-webhook?t=<private token>` for paid
and refunded events. Expected result: a controlled signed payload receives 200,
segments once, and a full refund removes only the refunded tier plus
review/lead membership while preserving unrelated tiers and All Customers.

### VERCEL — environment and abuse controls

`Vercel -> finders-book-v34 -> Settings -> Environment Variables`

Required Production variables:

| Name | Secret | Requirement |
|---|---|---|
| `MAILERLITE_API_KEY` | yes | required for lead, contact, purchase, and refund routing |
| `PAYHIP_API_KEY` | yes | required to verify Payhip's static event signature |
| `PAYHIP_WEBHOOK_TOKEN` | yes | required 32+ character second factor in webhook and private-health URLs |
| `GAP_CHECK_TOKEN_SECRET` | yes | required; 32 random bytes encoded as 64 hex characters |

Optional overrides should be left unset while the recorded live IDs remain
current: `ML_GROUP_LEADS`, `ML_GROUP_ALL_CUSTOMERS`, `ML_GROUP_ESSENTIALS`,
`ML_GROUP_ULTIMATE`, `ML_GROUP_FAMILY_BUNDLE`, `ML_GROUP_REFUNDED`,
`ML_GROUP_REVIEW_REQUESTED`, `ML_GROUP_CONTACT_QUESTION`,
`ML_GROUP_CONTACT_FEEDBACK`, `ML_GROUP_CONTACT_LICENSING`,
`PAYHIP_PRODUCT_MAP`, `RESPECT_EMAIL_CONSENT`, `REFUND_ON_PARTIAL`, and
`MAILERLITE_SUBSCRIBER_STATUS`. Never add `NEXT_PUBLIC_` to a secret name.

Apply required values to Production. Apply them to Preview only if a controlled
preview may safely touch the live MailerLite/Payhip account; otherwise use test
service credentials. Redeploy after any change and call the private health URL.
In Firewall, add route-specific rate limits for `/api/contact` and
`/api/gap-check-subscribe` if the plan supports them. Expected result: health
reports all four required variables present without exposing values.

Exact Vercel procedure:

1. Open `Vercel -> finders-book-v34 -> Settings -> Environment Variables`.
2. Add each of the four required names separately. Paste values from the named
   service; never paste them into repository files, tickets, or chat.
3. Generate `PAYHIP_WEBHOOK_TOKEN` and `GAP_CHECK_TOKEN_SECRET` independently
   with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
4. Check **Production** for all four. Check **Preview** only when preview tests
   are intentionally allowed to write to the connected service accounts.
5. Leave sender email/name out of Vercel: those are MailerLite account/email
   settings, not application environment variables.
6. Save, redeploy the current `main` commit, then request
   `/api/health?t=<PAYHIP_WEBHOOK_TOKEN>` with GET. Confirm HTTP 200 and all four
   required flags `true`; the response must not contain any secret value.
7. In Vercel Deployment details, confirm the production deployment's Git SHA
   equals GitHub `main` before testing forms or webhooks.

### GOOGLE SEARCH CONSOLE — property and sitemap

`Google Search Console -> Add property -> Domain`

1. Sign into the Google account that will permanently own the property.
2. Click **Add property**, select **Domain**, and enter only
   `familyfindersbook.com` (no protocol or path).
3. Copy Google's `google-site-verification=...` TXT value. At the DNS provider,
   add a TXT record at host/name `@`; do not remove existing SPF, DKIM, DMARC, or
   MailerLite records. Wait for DNS propagation, then click **Verify**.
4. In `Indexing -> Sitemaps`, enter `sitemap.xml` (the resulting URL must be
   `https://www.familyfindersbook.com/sitemap.xml`) and click **Submit**.
5. Confirm status **Success**, HTTP 200, and seven discoverable canonical pages.
6. Use **URL inspection** for `/`, `/order.html`, `/about.html`,
   `/contact.html`, `/privacy-policy.html`, `/refund-policy.html`, and
   `/terms.html`. Run **Test live URL** first; request indexing only when the
   user-declared and Google-selected canonical use `https://www.familyfindersbook.com/...`.
7. In `Pages`, review Not indexed reasons after Google recrawls. Vercel preview
   aliases and 404s must not become indexed; do not request indexing for them.
8. Recheck the sitemap after 48–72 hours and weekly until all intended pages are
   discovered. Expected result: verified Domain property, sitemap Success, no
   canonical split between apex/www/Vercel aliases, and no blocked intended page.

### GA4 — events and attribution

`GA4 -> Admin -> DebugView / Events / Key Events` and `Payhip -> Marketing/Analytics`

1. In `Admin -> Data collection and modification -> Data streams`, open the Web
   stream for `https://www.familyfindersbook.com` and confirm Measurement ID
   `G-ZXX0M4VYT5`.
2. In a private browser window, open the production site, decline analytics,
   and confirm no GA request/event appears. Withdraw/reload once more to verify
   consent persists.
3. Open a fresh private window, accept analytics, then open GA4 **DebugView**.
   Use one clearly labeled test identity and append UTMs such as
   `?utm_source=manual_qa&utm_medium=test&utm_campaign=launch_validation`.
4. Submit the Gap Check with a controlled address. Confirm exactly one
   `lead_submit` event and verify page/location plus campaign parameters; do not
   treat a validation error as a conversion.
5. Click each Essentials, Ultimate, and Family Bundle CTA once. Confirm exactly
   one `checkout_click` per click with the expected product/tier and destination.
6. In Payhip's analytics/integration settings, connect the same GA4 property if
   its current interface offers a native GA4 field. Use Payhip's supported test
   or 100%-discount transaction when available; do not charge a live card solely
   for QA. Confirm one GA4 recommended `purchase` event with transaction ID,
   value, currency, and item;
   repeat delivery of the same webhook/confirmation must not duplicate it.
7. In `Admin -> Events`, wait for processed events, then mark `lead_submit`,
   `checkout_click`, and `purchase` as Key Events only after the payload and
   deduplication checks pass. Event names are case-sensitive: do not create a
   second custom `Purchase` event beside the standard lowercase `purchase`.
8. In `Reports -> Acquisition`, verify the manual QA UTM source/medium/campaign
   survives from landing through the available checkout/purchase handoff.
9. Remove/exclude internal QA traffic from business reporting after validation.
   Expected result: consent-respecting, single-fire lead/checkout events and one
   attributable Purchase per transaction.

### CONTACT — operational alert

Choose a support inbox/transactional provider or a monitored MailerLite queue
that alerts `info@familyfindersbook.com` when a contact group receives a new
message. Expected result: a controlled contact receives acknowledgement and an
internal owner sees the message without polling the subscriber list.

### GITHUB — completed CI recovery

The billing lock was resolved. Workflow `31880730311` executed normal runner
steps and passed Static validation plus Rendered-page smoke test. No further
billing action is required for this launch checklist.

## 11A. Controlled Family purchase and Step 9 completion

| Gate | Result |
|---|---|
| Fresh Family checkout | PASS — $89 discounted to $0 with approved QA coupon |
| Payhip order ledger | PASS — Family product increased to 2 orders |
| Download handoff | PASS — Payhip reported the download email sent |
| Production webhook | PASS — POST 200 and `paid -> family_bundle` log |
| MailerLite routing | PASS — Family Bundle Buyers + All Customers only |
| Family onboarding | ACTIVE — new subscribers only; 0 in progress after activation |
| Review Request | ACTIVE — new subscribers only; 0 in progress after activation |
| Support-address correction | PASS — three product descriptions and two refund references |
| QA coupon cleanup | PASS — all five deleted; Payhip shows 0 coupons |

The connected Gmail account could not read the controlled purchase inbox, so
Payhip's sent confirmation is recorded without fabricating independent receipt.
Step 9 is approved to proceed as a monitored controlled soft launch.

## 12. Approval Gates

### APPROVAL GATE — MERGE TO MAIN

APPROVED on 2026-08-15. PRs #13 and #14 are merged. PR #15 standardizes the
support/sender identity and includes this updated runbook; it passed static and
rendered-page CI and is authorized for merge and Vercel production verification.

### APPROVAL GATE — MAILERLITE ACTIVATION

APPROVED AND EXECUTED for Family Bundle Onboarding and Review Request on
2026-08-15. Both use **No, only add new subscribers** and showed 0 in progress
after activation. This is not blanket approval to activate inactive superseded
or refund workflows.

## 13. Launch Blockers

- P1: the Gap Check automation still reports editor-completion warnings and suppression/exit logic is absent.
- P1: overlapping MailerLite nurture/onboarding workflows are not reconciled.
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
- [x] PR #12, PR #13, and PR #14 merged
- [x] PR #15 approved after green static and rendered-page CI
- [x] GitHub billing restored and remote CI pass
- [x] merge approved by Michael on 2026-08-15
- [x] final main SHA verified

### Engineering and website

- [x] clean dependency install
- [x] JS syntax and static validation
- [x] 67 local API/static assertions
- [x] public routes and CTAs inspected
- [x] SEO/structured-data checks
- [x] accessibility defects repaired locally
- [x] performance baseline recorded
- [x] remote desktop/mobile render suite
- [x] repaired Vercel preview build READY
- [x] exact PR tree verified by render CI and READY Vercel preview
- [x] production verification after approved merge

### Funnel and services

- [x] lead endpoint and signed download tests
- [x] purchase/refund lifecycle tests
- [x] Payhip public products/prices/policy
- [x] MailerLite groups and all nine workflows inventoried
- [x] MailerLite domain authenticated and all 27 From/Reply-to identities standardized
- [x] both campaign drafts standardized and left unscheduled/undesigned
- [x] controlled Family order, webhook 200, delivery handoff, and exact groups verified
- [ ] queued Contact test receipt/content confirmed in the support inbox
- [ ] Gap Check completion warnings cleared
- [ ] buyer/refund exits configured
- [ ] one onboarding/nurture generation chosen
- [x] Payhip Family purchase-webhook path verified end to end
- [x] controlled Family purchase and group-isolation test
- [x] Family Bundle Onboarding and Review Request activation approved and completed
- [x] all five QA coupons removed
- [ ] controlled review timing/delivery observation after its configured delay
- [ ] GA4 Purchase/Key Events verified

### Documentation

- [x] `areas/finders-book.md`
- [x] architecture and integration map
- [x] deployment and troubleshooting runbook
- [x] persistent launch-readiness report
