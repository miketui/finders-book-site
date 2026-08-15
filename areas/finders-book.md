# The Finder's Book operational runbook

Last verified: 2026-08-15

## Project identity

- Canonical repository: `miketui/finders-book-site`
- Production branch: `main`
- Canonical site: `https://www.familyfindersbook.com`
- Apex redirect: `https://familyfindersbook.com` -> `https://www.familyfindersbook.com`
- Vercel project: `finders-book-v34` in team `mikes-projects-1e9a868e`
- Support address: `info@michaeldavidjr.beauty`
- Product: The Finder's Book — The Family Clarity System™

Do not merge, trigger a production deployment, activate MailerLite automations,
send live email, run a live Payhip transaction, rotate credentials, or delete
subscriber/customer/production resources without Michael's approval.

## GitHub and Composio

GitHub access for `finders-book-site` runs through Composio (account: `miketui`,
connection: `github_zerma-beech`, active). Enhanced Controls must stay OFF in
Composio settings for claude.ai web sessions — it requires elicitation, which
that client does not support. If a Claude session says “Enhanced Controls is
not supported,” the fix is the toggle at
`dashboard.composio.dev/~/org/connect/settings`, not automatically
re-authorizing the GitHub App.

For Claude Cowork sessions, verify repository push authorization with
`git push --dry-run` at session start before doing push-dependent work.

### ChatGPT Work

Before repository operations:

- Discover the active GitHub/Composio tool path.
- Confirm repository access to `miketui/finders-book-site`.
- Confirm read/write capabilities rather than assuming Claude's access model applies.
- Use connected apps where available.
- Do not merge, deploy, activate campaigns, send email, charge, or delete without Michael's approval.

On 2026-08-15, ChatGPT Work had direct connected-GitHub read/write/admin access.
The terminal clone was readable but had no push credential (`git push --dry-run`
could not read a username). Use the connected GitHub app for an approved remote
branch/PR/merge rather than copying credentials into the terminal.

## Architecture

| Layer | Current implementation |
|---|---|
| Frontend | Static HTML, CSS, and browser JavaScript |
| Runtime | Vercel static hosting plus Node serverless routes in `api/` |
| Lead capture | `motion.js` -> `POST /api/gap-check-subscribe` -> MailerLite Leads group |
| Lead magnet | HMAC token -> `GET /api/gap-check-download` -> repository PDF |
| Contact | `contact.js` -> `POST /api/contact` -> non-marketing MailerLite contact groups |
| Checkout | Payhip product links; no embedded card handling on this site |
| Purchase lifecycle | Payhip webhook -> `/api/payhip-webhook` -> MailerLite groups |
| Analytics | GA4 `G-ZXX0M4VYT5`, Vercel Web Analytics, `analytics.js` event bridge |
| Deployment | GitHub `main` -> Vercel project `finders-book-v34` |
| Database/Auth | None; Supabase is available in Work but not used by this project |

## Server routes

- `POST /api/gap-check-subscribe`: validates/rate-limits signup, adds Leads,
  and issues a 15-minute signed token.
- `GET /api/gap-check-download?token=...`: validates the token and returns
  `Family-Readiness-Gap-Check.pdf` as an attachment.
- `POST /api/contact`: validates/rate-limits and routes question, feedback, or
  licensing contacts to dedicated groups. It must never add Leads.
- `POST /api/payhip-webhook?t=...`: verifies both Payhip's static digest and a
  private URL token, then maintains buyer/refund group membership.
- `GET /api/health?t=...`: token-gated presence/fingerprint check. It never
  returns secret values.

## Vercel

- Project ID: `prj_1LXLU5n3bvZSL3310dsGjwE3yuu0`
- Project: `finders-book-v34`
- Production branch: `main`
- Node runtime setting: 24.x
- Domains: `www.familyfindersbook.com`, `familyfindersbook.com`, and protected
  Vercel aliases
- Verified production deployment: `dpl_DZeaArtRqNCWALSdcVYkD9fYaHAH`
- Verified production commit before this repair: `3501434a75da221420c7c570d97af8dc90c85211`

Required Production variables:

- `MAILERLITE_API_KEY`
- `PAYHIP_API_KEY`
- `PAYHIP_WEBHOOK_TOKEN`
- `GAP_CHECK_TOKEN_SECRET`

Optional group/product/behavior overrides are documented in `.env.example`.
Vercel applies environment changes only to new deployments.

## Payhip

| Edition | Product key | Price | URL | Verified delivery type |
|---|---|---:|---|---|
| Essentials | `eHcPG` | $29 | `https://payhip.com/b/eHcPG` | ZIP, 27 MB |
| Ultimate | `Y1O7B` | $49 | `https://payhip.com/b/Y1O7B` | ZIP, 26 MB |
| Family Bundle | `xPuv4` | $89 | `https://payhip.com/b/xPuv4` | ZIP, 26 MB |

`Y1O7B` contains a capital letter O. `Y107B` is wrong.

Public product pages, prices, Buy Now/Add to Cart controls, stated contents,
and Payhip's refund policy were verified in a browser on 2026-08-15. The Payhip
connector available through Composio can process webhook payloads and manage
coupons but cannot inspect product files or dashboard webhook settings. Verify
the live webhook URL and attached files in the Payhip dashboard before launch.

### Purchase and refund behavior

```text
paid + consented
-> All Customers
-> matching tier group(s)
-> remove Leads
-> remove Refunded

full refund
-> Refunded
-> remove All Customers
-> remove all tier groups
-> remove Review Requested
-> remove Leads
```

Partial refunds do not revoke groups by default. Buyers who declined marketing
email are not added to marketing groups. Payhip remains responsible for product
receipt and file delivery.

## MailerLite

Connected account: account `2202141`; authentication email
`warrenjrmd@gmail.com`. That login is not the public support/reply-to address.

### Groups

| Group | ID |
|---|---|
| Finder's Book — Leads | `194226608569059081` |
| All Customers | `194226612687865798` |
| Essentials Buyers | `194226609478173767` |
| Ultimate Buyers | `194226610412455586` |
| Family Bundle Buyers | `194226611505071661` |
| Refunded | `194226614527067324` |
| Review Requested | `194226613598028898` |
| Contact — question | `195847261261923400` |
| Contact — feedback | `195847261915186382` |
| Contact — licensing | `195847263345444315` |

### Automation inventory

All nine workflows were disabled on 2026-08-15. Dry simulations completed
without sending email, but disabled is not equivalent to launch-ready.

| Automation | ID | Current state | Decision before activation |
|---|---|---|---|
| Refund Handling | `194226711638836895` | disabled | Keep only if refund email is desired; webhook now performs cleanup |
| Essentials Onboarding | `194226713836651864` | disabled | Candidate after sender/reply-to/plaintext QA |
| Readiness Lead Nurture | `194226719223186795` | disabled | Supersede with the three-email Gap Check flow |
| Ultimate Onboarding | `194226725902616321` | disabled | Candidate after sender/reply-to/plaintext QA |
| Family Onboarding | `194226731545004025` | disabled | Candidate after sender/reply-to/plaintext QA |
| Review Request | `194226737309025696` | disabled | Add exit/condition for Refunded before activation |
| Gap Check Lead Nurture | `195847295840814845` | disabled/incomplete | Restore three designs, then add buyer/refund suppression |
| Buyer Onboarding | `195847299585279235` | disabled | Do not activate beside tier-specific onboarding; lacks refund exclusion |
| Contact Acknowledgement | `195847302637684408` | disabled | Candidate after sender/reply-to/plaintext QA |

Preferred sender: `Joanne and Michael`.
Preferred reply-to: `info@michaeldavidjr.beauty`.

Before any activation:

1. Choose one lead nurture path and one onboarding model; do not activate both generations.
2. Make the three Gap Check subjects/designs match their intended order.
3. Add All Customers and Refunded suppression/exit behavior to lead nurture.
4. Add Refunded exit/conditions to review and onboarding paths.
5. Replace generic MailerLite plaintext fallbacks and verify preheaders.
6. Standardize sender and reply-to.
7. Use one controlled test subscriber and confirm no real group members can enter.
8. Obtain Michael's explicit activation approval.

### 2026-08-15 MailerLite connector incident

The connector's subject-update action did not edit the existing automation
email records in place. It replaced all three designed records with new,
undesigned records. The workflow stayed disabled, no subscriber was entered,
and no email was sent. The subjects now match the workflow order, but the HTML
designs must be restored in the dashboard before testing.

Retained MailerLite screenshots of the prior designs:

- Email 1: `https://storage.googleapis.com/mailerlite-screenshots-prod/screenshot/emails/195851935249597627/1284x7362026-08-15-08:25:20.png`
- Email 2: `https://storage.googleapis.com/mailerlite-screenshots-prod/screenshot/emails/195851883067213130/1284x7362026-08-15-08:25:57.png`
- Email 3: `https://storage.googleapis.com/mailerlite-screenshots-prod/screenshot/emails/195851930900104432/1284x7362026-08-15-08:26:31.png`

Do not use the connector's subject-only update action on a designed automation
again. Use the MailerLite editor or a capability that can preserve/apply HTML.

## Analytics

- GA4 measurement ID: `G-ZXX0M4VYT5`
- Repository events: `lead_submit`, `checkout_click`
- Purchase occurs on Payhip; no verified GA4 `Purchase` handoff exists yet.
- All public pages load GA4 and Vercel Web Analytics after the launch repair.
- `analytics.js` fans eligible events into GA4/dataLayer and Vercel Analytics.

Live PageSpeed baseline on 2026-08-15 before the local contrast repair:

- Mobile: Performance 93, Accessibility 96, Best Practices 100, SEO 100;
  FCP 1.8s, LCP 3.0s, TBT 20ms, CLS 0.
- Desktop: Performance 99, Accessibility 96, Best Practices 100, SEO 100;
  FCP 0.3s, LCP 0.8s, TBT 90ms, CLS 0.

The only automated accessibility failure was contrast. It traced to CSS
cascade overrides on the default header and the featured Ultimate tier and was
repaired locally. Rerun PageSpeed against the deployed repair.

MailerLite, Payhip, and Vercel access does not provide the GA4 Admin interface.
Manually verify `lead_submit`, `checkout_click`, and `Purchase` in GA4 DebugView,
then mark genuine conversions as Key Events.

## Git and branch history

- PR #11 (`fix/wire-contact-form-and-ci-guards`) was merged into `main` at
  `3501434`; its contact route/tests are current.
- `agent/launch-audit-fixes` is superseded by newer work on `main` and must not
  be merged wholesale.
- Other inspected remote branches were already merged or had no commits ahead
  of `main`.
- GitHub Actions at the starting SHA failed because `package.json` and
  `package-lock.json` disagreed on Playwright versions. Vercel deployment was
  healthy despite that CI failure.
- Draft PR #12 (`codex/launch-readiness-repair`) contains the launch repair.
  Its Vercel preview `dpl_AsnDZpQyFeNnMnoejdEkmPzmSTYB` built successfully at
  SHA `49b5d847`, but Actions run `31878427877` did not start either job because
  GitHub annotated the account as locked due to a billing issue.

## Security and troubleshooting

- Never print or commit secret values. Run `npm run check:secrets`.
- Keep Payhip's `?t=PAYHIP_WEBHOOK_TOKEN` factor. Its documented signature is
  a static SHA-256 digest of the API key, not a payload HMAC.
- A 401 from `/api/health` without the token is expected.
- A 405 from POST-only API routes when fetched by GET is expected.
- If lead signup works but the PDF does not download, verify
  `GAP_CHECK_TOKEN_SECRET` in the deployed Production environment and redeploy.
- If a sale does not segment, compare the Payhip product key with
  `eHcPG`/`Y1O7B`/`xPuv4`, verify the webhook URL token, inspect Vercel runtime
  logs, and use the private health endpoint.
- If CI fails before tests, run `npm install --package-lock-only` and confirm
  Playwright exists only in `devDependencies`, then run a clean `npm ci`.
- If a job has zero steps and zero runner assignment, inspect the check-run
  annotation before changing code. The PR #12 failure is an account billing
  lock, not a package or test failure.
- Do not weaken webhook authentication to make a simulation pass.

## Pre-launch sequence

1. `npm ci --ignore-scripts`
2. `npm run validate`
3. `npx playwright install chromium && npm run test:render`
4. Review the diff and branch/PR status.
5. Obtain approval to merge; disclose that merging `main` triggers Vercel production.
6. Verify CI, deployed commit, routes, forms, links, headers, and mobile layout.
7. Configure the Payhip webhook and GA4 Key Events manually where connected tools cannot.
8. Reconcile MailerLite workflows and request a separate controlled-test activation approval.
9. Run controlled lead, purchase-webhook, refund, and review-suppression tests.
10. Activate only the approved, non-overlapping MailerLite workflows.
