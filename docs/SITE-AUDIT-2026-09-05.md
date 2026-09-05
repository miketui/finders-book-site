# Finder's Book — production site audit

**Audit date:** 2026-09-05  
**Canonical site:** `https://www.familyfindersbook.com`  
**Repository:** `miketui/finders-book-site` @ `83dfe67` (`main`)  
**Production deployment:** `dpl_BzeaWs4gTTgpJs6ug3qmRBbdbN1q` (READY)  
**Vercel project:** `finders-book-v34`

This is a current-state audit of the live website, checkout listings, MailerLite, Vercel, and repository gates. It supersedes August launch snapshots wherever they disagree. It does **not** authorize MailerLite sends, Payhip dashboard edits, or a new paid QA order.

## Verdict

**The website is live, gated, and internally honest. Checkout is not.**

Public pages, security headers, serverless routes, and repository validation are healthy after Weeks 1–3. A browser pass of home, order, contact, `/start`, Gap Check, mobile nav, consent, and the branded 404 found no customer-facing site defect.

The blocking issue is off-site: Payhip’s Ultimate and Family Bundle storefronts still describe a **49-page** product. The website, schema, and PR #82 now say Ultimate is **250 pages**. Anyone who lands on Payhip’s product page, or who reads the listing after a no-JS `/buy` click, is sold a different book than the site promises.

Do not treat `docs/FINAL-LAUNCH-CERTIFICATION-2026-08-19.md` as the current commerce-copy verdict.

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
| Website copy honesty | PASS | Public HTML, JSON-LD (`Pages: 250`), and order cards use 250 for Ultimate and 49 only for Essentials 001–049 |
| Payhip listings | **FAIL / owner** | Ultimate (`Y1O7B`) and Family Bundle (`xPuv4`) still say “49-page fillable PDF / 49-page printable PDF”. Essentials (`eHcPG`) 49-page copy is correct. All three still show Payhip “On Sale”. Prices remain $29 / $49 / $89 |
| MailerLite buyer mail | PASS with notes | Five original production workflows still **enabled** (Essentials, Ultimate, Family, Review Request, Gap Check Lead Nurture). Two Week 3 drafts remain **disabled**. Site Gap Check does not subscribe unless `GAP_CHECK_MAILERLITE_ENABLED=1` |
| Analytics / traffic | INFO | Vercel Web Analytics since 2026-07-28: 124 visitors / 239 pageviews. Home 119, `/order.html` 4. Almost all referrers are blank; Google 2, Bing 1 |
| GTM Autopilot | FAIL / owner | Scheduled runs still die on OpenAI `credit_balance_exhausted` |
| Paid journey re-proof | NOT RERUN | No new charge. Prior controlled Ultimate QA remains the last paid proof |

## P0 — Payhip still sells the old 49-page Ultimate

**Owner-only. Do not edit slugs, prices, or files.**

Live Payhip copy observed 2026-09-05:

| Product | Slug | Price | Listing claim |
|---|---|---|---|
| Essentials | `eHcPG` | $29.00 | 49-page binder — **matches** the site |
| Ultimate | `Y1O7B` | $49.00 | “combines a **49-page** family emergency binder” and “**49-page** fillable PDF • **49-page** printable PDF” — **contradicts** the site |
| Family Bundle | `xPuv4` | $89.00 | “Everything included in the Ultimate Digital Edition • **49-page** fillable PDF • **49-page** printable PDF” — **contradicts** the site |

Website (production HTML + Product JSON-LD) says Ultimate is a 250-page fillable + print system. PR #82 called shipping under “49 pages” a ship-stop **for the site**. The Payhip editor was never updated.

Also still present on all three listings: Payhip’s **On Sale** badge (compare-at chrome). Site CSS cannot restyle the iframe. Already listed in `docs/PAYHIP-OVERLAY.md`.

**What to change in Payhip (copy only):**

1. Ultimate and Family descriptions: 250-page fillable PDF and 250-page print PDF. Keep $49 / $89. Keep slugs `Y1O7B` / `xPuv4`.
2. Optional: remove sale/compare-at so checkout is not dressed as a discount.
3. After saving, open `/buy?link=Y1O7B` and the overlay from the homepage CTA and read the iframe copy. Overlay titles from site JS are already “The Finder's Book — Ultimate · The Family Clarity System™”; the **body** still comes from the dashboard.

Until that is done, a buyer can be told 250 pages on the website and 49 pages at the register.

## P1

| ID | Area | Finding | Action |
|---|---|---|---|
| A-01 | Payhip return | Overlay `successUrl` to `/start.html` is still best-effort. Dashboard redirect is not confirmed on this pass | Owner: Checkout Settings redirect, all three SKUs. Tradeoff: in-overlay instant download is skipped; `/start` already says use the Payhip email |
| A-02 | MailerLite copy | Enabled onboarding emails were designed 2026-08-19, before the 250-page honesty pass. They may still say 49 pages | Owner: open Ultimate / Family welcome emails in MailerLite and align page count. Do not enable the two new Week 3 drafts |
| A-03 | Gap Check hold | Site scoring is on-page and MailerLite subscribe is held. **Gap Check Lead Nurture is still enabled** on the Leads group. New site signups will not join Leads until the flag is on; the two existing unconfirmed leads still could | Leave held unless CoS wants lead mail. Do not flip `GAP_CHECK_MAILERLITE_ENABLED` from this audit |
| A-04 | Review / onboarding queues | Ultimate Onboarding: 1 in queue. Review Request: 3 in queue, 0 sent | Expected for a tiny list; confirm none are refunded QA leftovers |
| A-05 | Ops docs | `docs/OPERATIONS.md` still said `/api/contact` stores messages in MailerLite groups. Production code emails the owner via Resend and does not create subscribers | Corrected in this PR. Leftover Contact:* groups remain at 0 |

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
- PageSpeed Insights API returned 429 from this environment; latest CI render job on `main` after #83 is the performance gate.
- GA4 Admin key-event UI was not re-opened; last recorded verification is 2026-08-18 in `docs/OWNER-ACTIONS.md`.

## Release rule

Ship site code as-is for Weeks 1–3. **Do not advertise 250 pages in paid or outbound channels until Payhip Ultimate/Family copy matches.** After the dashboard edit, spot-check overlay + `/buy?link=Y1O7B` and the Ultimate welcome email. Then, and only then, the August “ready for launch traffic” claim applies to checkout as well as the website.
