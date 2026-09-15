# Finder's Book — production site audit

**Audit date:** 2026-09-05  
**Canonical site:** `https://www.familyfindersbook.com`  
**Repository:** `miketui/finders-book-site` @ `83dfe67` (`main`)  
**Production deployment:** `dpl_BzeaWs4gTTgpJs6ug3qmRBbdbN1q` (READY)  
**Vercel project:** `finders-book-v34`

This is a current-state audit of the live website, checkout listings, MailerLite, Vercel, and repository gates. It supersedes August launch snapshots wherever they disagree. It does **not** authorize MailerLite sends, Payhip dashboard edits, or a new paid QA order.

## Verdict

**The website is live and gated. Page count is unresolved.**

Public pages, security headers, serverless routes, and repository validation are healthy after Weeks 1–3. A browser pass of home, order, contact, `/start`, Gap Check, mobile nav, consent, and the branded 404 found no customer-facing site defect.

The blocking issue is a **page-count split nobody can currently settle**:

1. The **website** (after PR #82) says Ultimate is **250 pages**.
2. Live **Payhip listings** for Ultimate and Family still say **49-page** fillable and print PDFs, as do three enabled MailerLite buyer emails.
3. The last **verified attached ZIPs** (`docs/PAYHIP-PACKAGE-MATRIX.md`, 2026-08-18) had **49-page cores on every tier** — but **those are no longer the attached files.** Payhip now advertises different download sizes on all three products, so the packages were replaced after that audit.

That third point is the important one. The 49-page baseline is stale, and the 250-page website copy was never checked against a file either. **Both numbers are currently unverified.** Nobody should publish either until someone opens the attached ZIP.

Do not treat `docs/FINAL-LAUNCH-CERTIFICATION-2026-08-19.md` or the package matrix as the current commerce verdict.

### Download size drift (public Payhip product pages, 2026-09-05)

| Tier | Slug | Verified 2026-08-18 | Payhip advertises now | Same file? |
|---|---|---:|---:|---|
| Essentials | `eHcPG` | 28,876,111 B (~28.9 MB) | ZIP (9 MB) | **no** |
| Ultimate | `Y1O7B` | 27,206,126 B (~27.2 MB) | ZIP (21 MB) | **no** |
| Family Bundle | `xPuv4` | 28,145,047 B (~28.1 MB) | ZIP (22 MB) | **no** |

Every tier shrank. A 49 → 250 page rewrite would normally grow a PDF, so this is more consistent with re-optimized or re-cut packages than with a straight page expansion — but size cannot prove page count either way. It only proves the audited archives are gone.

## Evidence matrix

| Layer | Result | Evidence |
|---|---|---|
| Production deploy | PASS | `dpl_BzeaWs4gTTgpJs6ug3qmRBbdbN1q` READY, aliases `www.familyfindersbook.com` and `familyfindersbook.com`, commit `83dfe67` (Week 3) |
| HTTPS / apex | PASS | Apex and HTTP both 308 to `https://www.familyfindersbook.com/`. HSTS `max-age=63072000; includeSubDomains; preload` |
| Public pages | PASS | All 13 sitemap URLs 200. Branded `404.html` for missing paths. `/gift` 404 (Week 4 still a draft PR) |
| Deploy surface | PASS | `/tests`, `/docs`, `/areas`, `.env.example` 404. `npm run validate` pass locally |
| Security headers / APIs | PASS | CSP, `X-Frame-Options`, nosniff. Health/webhook/contact/gap-check fail closed (401/405/400). Contact POST does not write MailerLite |
| Repository CI | PASS | Latest `main` “Validate Finder's Book site” green. Local validate + 144 unit assertions pass |
| Browser UX | PASS | Desktop + 375px: Skip intro, hero $49 / 250 pages, header CTA, Gap Check scores without email, three-tier order page, consent allow/decline, `/start` is post-purchase not an upsell |
| Website copy | PASS vs current HTML | Public HTML, JSON-LD (`Pages: 250`), and order cards use 250 for Ultimate and 49 only for Essentials 001–049. **Not proven against the live ZIP.** |
| Payhip listings | FAIL / owner | Ultimate (`Y1O7B`) and Family Bundle (`xPuv4`) still say 49-page PDFs. Essentials (`eHcPG`) 49-page copy matches both the site and the 2026-08-18 ZIP audit. All three still show “On Sale”. Prices remain $29 / $49 / $89 |
| Attached paid PDFs | **UNVERIFIABLE from here** | Advertised ZIP sizes (9/21/22 MB) no longer match the 2026-08-18 archives, so the 49-page record is stale. Download needs a Payhip login this environment does not have. |
| MailerLite buyer copy | FAIL / owner | Three **enabled** emails still say 49 pages: Ultimate `196196207638349589`, Family `196196225144326000`, Essentials `196196188456748062`. Only the Essentials one is consistent with its own tier |
| MailerLite buyer mail | PASS with notes | Five original production workflows still **enabled** (Essentials, Ultimate, Family, Review Request, Gap Check Lead Nurture). Two Week 3 drafts remain **disabled**. Site Gap Check does not subscribe unless `GAP_CHECK_MAILERLITE_ENABLED=1` |
| Analytics / traffic | INFO | Vercel Web Analytics since 2026-07-28: 124 visitors / 239 pageviews. Home 119, `/order.html` 4. Almost all referrers are blank; Google 2, Bing 1 |
| GTM Autopilot | FAIL / owner | Scheduled runs still die on OpenAI `credit_balance_exhausted` |
| Paid journey re-proof | NOT RERUN | No new charge. Prior controlled Ultimate QA remains the last paid proof |

## P0 — Count the attached PDFs before advertising 250 pages

**Owner-only. Do not change slugs, prices, or webhook. Do not rewrite Payhip or MailerLite copy until the page count is in hand.**

Live Payhip **copy** observed 2026-09-05:

| Product | Slug | Price | Listing claim |
|---|---|---|---|
| Essentials | `eHcPG` | $29.00 | 49-page binder |
| Ultimate | `Y1O7B` | $49.00 | “combines a **49-page** family emergency binder” and “**49-page** fillable PDF • **49-page** printable PDF” |
| Family Bundle | `xPuv4` | $89.00 | “Everything included in the Ultimate Digital Edition • **49-page** fillable PDF • **49-page** printable PDF” |

Last **file** evidence (`docs/PAYHIP-PACKAGE-MATRIX.md`, 2026-08-18) recorded `The_Finders_Book_Ultimate_v1.2.3_PAYHIP_READY_FINAL.zip` with a 49-page fillable core and a 49-page print core. The advertised download size has since changed on all three products, so that record no longer describes what buyers receive.

**Required sequence — one person with a Payhip login, 10 minutes:**

1. Payhip → product editor → download the currently attached **Ultimate** ZIP. Open the fillable PDF and the print PDF and read the page count of each. Repeat for **Family Bundle** and **Essentials**. Record filename and byte size.
2. **If Ultimate is 250 pages:** the website is right. Update the Payhip Ultimate/Family descriptions and the three MailerLite emails listed below to 250. Keep $29 / $49 / $89 and slugs `eHcPG` / `Y1O7B` / `xPuv4`. Rewrite `docs/PAYHIP-PACKAGE-MATRIX.md` with the new sizes and hashes.
3. **If Ultimate is still 49 pages:** the **website** is overselling and is the thing to fix. Either attach the real 250-page package and then update copy everywhere, or revert public HTML/JSON-LD to 49 until that file exists. Do not raise Payhip or MailerLite to 250 to match a claim the file does not support.
4. Either way, rewrite the package matrix. It is now known-stale.

MailerLite emails to correct in the same pass (all **enabled**, so they are reaching real buyers):

| Automation | Email | ID | Current wording |
|---|---|---|---|
| Ultimate Onboarding | Your Finder's Book Ultimate is ready | `196196207638349589` | “both **49-page** editions (fillable and print), five implementation tools” |
| Family Bundle Onboarding | Your Family Bundle is ready | `196196225144326000` | “do not hand a blank **49-page** book to an ageing parent” |
| Essentials Onboarding | Your Finder's Book is ready | `196196188456748062` | “two editions of the same **49 pages**” — correct for Essentials; leave unless the extract changes |

All three listings also still show **On Sale** chrome, independent of page count (`docs/PAYHIP-OVERLAY.md`).

## Why this audit could not fix it

The remediation was attempted and is blocked on credentials, not on effort:

| Path | Result |
|---|---|
| Composio MCP (Payhip connector) | `needsAuth`. OAuth cannot be completed from a headless cloud agent. Even in August the connector could not read products, files, or webhook settings — only coupons/payloads |
| Payhip REST | No `PAYHIP_API_KEY` in this environment. Payhip also exposes no public product-description write API |
| Cloud browser → `payhip.com/dashboard` | Redirects to `payhip.com/auth/login`. No existing session; no credentials supplied, and none were guessed |
| Cloud browser → `dashboard.mailerlite.com` | Cloudflare “verify you are human” challenge |
| MailerLite MCP | Authenticated, and used for all read evidence here. Exposes no enable/disable toggle — the only destructive option is permanent deletion, which was deliberately not used |

The one action that unblocks everything — opening the attached PDF and counting pages — requires a Payhip seller login. That is an owner action by construction.

## P1

| ID | Area | Finding | Action |
|---|---|---|---|
| A-01 | Payhip return | Overlay `successUrl` to `/start.html` is still best-effort. Dashboard redirect is not confirmed on this pass | Owner: Checkout Settings redirect, all three SKUs. Tradeoff: in-overlay instant download is skipped; `/start` already says use the Payhip email |
| A-02 | MailerLite copy | Enabled onboarding emails were designed 2026-08-19 against the 49-page package. Align them only after the attached PDF page count is known | Same gate as P0. Do not enable the two new Week 3 drafts |
| A-03 | Gap Check hold | Site scoring is on-page and MailerLite subscribe is held. **Gap Check Lead Nurture is still enabled** on the Leads group. New site signups will not join Leads until the flag is on; the two existing unconfirmed leads still could | Leave held unless CoS wants lead mail. Do not flip `GAP_CHECK_MAILERLITE_ENABLED` from this audit |
| A-04 | Review / onboarding queues | Ultimate Onboarding: 1 in queue. Review Request: 3 in queue, 0 sent | Expected for a tiny list; confirm none are refunded QA leftovers |
| A-05 | Ops docs | Contact runbook still pointed 502/503 at MailerLite and named `behaviour.contact_owner_alert`, which the health route does not emit | Corrected in this PR: Resend is the contact outage target; flags are `contact_owner_email` / `contact_secondary_alert`. Leftover Contact:* groups remain at 0 |

## P2

| ID | Area | Finding |
|---|---|---|
| A-06 | Discovery | 124 visitors in ~6 weeks; `/order.html` 4; `/how-it-works.html` and `/start.html` do not appear in Web Analytics top paths. SEO articles exist but are footer-only. Organic search is effectively unproven |
| A-07 | `/start.html` robots | Post-purchase orientation is `index,follow` and in the sitemap (priority 0.4). Fine for branded “start tonight” queries; consider `noindex` if it starts competing with the homepage |
| A-08 | Trust chrome | Homepage creator slots still say “Portrait to come”. Intentional (Week 3: do not invent photos or reviews) |
| A-09 | GTM Autopilot | Nightly job fails on OpenAI quota. Phase 0 remains halted. Not a storefront defect |
| A-10 | Draft gift path | PR #84 `/gift` is draft/hold. Production `/gift` 404s. Correct until CoS ships Week 4 |
| A-11 | Unsent campaigns | Three August drafts remain unscheduled (`FB-LAUNCH-01/02/03`). Do not send without CoS |

## P3 / maintenance

- Node `[DEP0169] url.parse()` still appears on `/api/health`. Repository code does not call it; dependency/runtime noise, no 5xx cluster in the 7-day error table.
- No `apple-touch-icon` (SVG favicon only).
- MailerLite automations still carry `email_domain_not_authenticated`. DNS has SPF, DMARC `p=none`, MailerLite domain verification TXT, and `litesrv._domainkey` CNAME. August treated this as a stale provider warning; do not re-run domain authentication.
- DMARC remains `p=none` (planned post-launch tightening).
- `list_automations` on the MailerLite connector only returned the two Week 3 drafts. The five live workflows still exist; use search/fetch, not that list, as source of truth.

## What is healthy (do not redo)

- Prices on the website: Essentials $29, Ultimate $49, Family Bundle $89. Payhip prices match.
- Checkout slugs: `eHcPG` / `Y1O7B` / `xPuv4`. Header and hero CTA go to Ultimate.
- Consent-gated GA4/Vercel analytics; equal Allow / Decline.
- Webhook tests: purchase adds All Customers + tier and removes Leads/Refunded; refunds are item-scoped; duplicates ignored; GA4 purchase/refund payloads contain no email.
- Contact: Resend-authoritative, no marketing subscribe, honeypot, rate limit.
- Gap Check: 12 questions, instant score, optional email path held, PDF is a one-page diagnostic, `X-Robots-Tag: noindex` on the public PDF URL (the URL is intentionally reachable for email delivery).
- Chrome nav/footer identical across 14 pages. Skip link and drawer a11y present.
- Preview deployments: Vercel Authentication on non-custom domains. Production custom domains are public.

## Traffic snapshot (Vercel Web Analytics, 2026-07-28 → 2026-09-06)

| Path | Visitors | Pageviews |
|---|---:|---:|
| `/` | 119 | 202 |
| `/refund-policy.html` | 8 | 10 |
| `/contact.html` | 6 | 10 |
| `/privacy-policy.html` | 6 | 7 |
| `/order.html` | 4 | 5 |
| `/about.html` | 3 | 3 |

Device mix is roughly even (64 desktop / 59 mobile). Header checkout skips `/order.html`, so the order-page drop is not by itself a broken funnel — but there is almost no proven organic demand.

## MailerLite snapshot (account `2202141`)

| Automation | Enabled | Queue | Notes |
|---|---|---|---|
| Essentials Onboarding | yes | 0 | Designed; refund group excluded; exit-on-mismatch |
| Ultimate Onboarding | yes | 1 | Designed; 6 sent historically |
| Family Bundle Onboarding | yes | 0 | Designed; 1 qualified, 0 sent |
| Review Request | yes | 3 | Designed; 0 sent |
| Gap Check Lead Nurture | yes | 0 | Still on; site subscribe is held |
| Gap Check PDF Opt-in (new) | **no** | — | Created 2026-09-05; leave off |
| Day-7 Review + Upgrade (new) | **no** | — | Created 2026-09-05; leave off |

Groups: All Customers 2, Leads 2 (unconfirmed), Ultimate 1, Family Bundle 1, Refunded 1, Essentials 0, Review Requested 0. Total subscribers 12. Embedded Gap Check form is **inactive**. No popups.

## Not in this pass

- No new card charge, refund, or webhook redelivery.
- No live contact-form or Gap Check email submit.
- Attached Payhip ZIP page counts were not re-opened (last count 2026-08-18).
- PageSpeed Insights API returned 429 from this environment; latest CI render job on `main` after #83 is the performance gate.
- GA4 Admin key-event UI was not re-opened; last recorded verification is 2026-08-18 in `docs/OWNER-ACTIONS.md`.

## Release rule

Ship no further page-count marketing until the attached Ultimate PDFs are counted. **Do not advertise 250 pages on Payhip, in MailerLite, or in paid channels unless those PDFs are actually 250 pages.** If they are still 49, the website copy from PR #82 is the defect. If they are 250, then update Payhip and MailerLite and rewrite `docs/PAYHIP-PACKAGE-MATRIX.md`. The August “ready for launch traffic” claim does not cover this split.
