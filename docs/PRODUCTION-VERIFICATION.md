# Controlled production verification

Automated checks prove the code behaves. They cannot prove that a real card
charge reaches a real MailerLite group and a real analytics property. This is
the manual pass, run against production after a deploy that touches checkout,
forms, the webhook, or analytics.

Run it in order. Record the date, the deployment SHA, and the outcome of each
row. Do not mark a row green from inspection — every row needs an observation.

**Deployment SHA under test:** ________  **Date:** ________  **Run by:** ________

## 0. Preconditions

| Check | How | Expected |
|---|---|---|
| Right commit is live | `/api/health?t=…` | `deployment.commit` matches the SHA you deployed |
| All secrets landed | same response | every `secrets_present` value `true` |
| Revenue reporting armed | same response | `behaviour.ga4_purchase_reporting: true` |
| GA4 key events | GA4 Admin | `purchase`, `checkout_click`, and `lead_submit` are configured as key events before traffic |
| Owner alerting armed | same response | `behaviour.contact_owner_alert: true` |
| Product map health | same response | `behaviour.product_map_valid: true`; source may be `built_in` or an intentionally configured environment override |

## 1. Lead magnet (Gap Check)

| # | Step | Expected |
|---|---|---|
| 1.1 | Submit the Gap Check form with an address you control | 200, download starts |
| 1.2 | Open the PDF | Correct file, `content-disposition: attachment`, correct filename |
| 1.3 | MailerLite → Leads group | Subscriber present, status `unconfirmed` |
| 1.4 | Wait for the first nurture email | "Your Family Readiness Gap Check" arrives, renders, links work |
| 1.5 | Re-open the download link after 15 minutes | Rejected — the token is short-lived by design |
| 1.6 | Submit again with the same address | Still returns a working download token |

## 2. Contact form — all three kinds

Run once per kind: **question**, **feedback**, **licensing**. The production route is intentionally **not** a MailerLite subscription path.

| # | Step | Expected |
|---|---|---|
| 2.1 | Submit the form | 200 and the on-page confirmation |
| 2.2 | MailerLite subscriber/groups | **No subscriber or group mutation** caused by the support submission |
| 2.3 | Marketing protection | The sender is not added to `Leads`, a buyer group, or any contact-marketing group merely for asking for support |
| 2.4 | Owner alert | The configured `CONTACT_NOTIFY_WEBHOOK_URL` endpoint receives the message |
| 2.5 | Reply | A human replies within the stated response window |

## 3. Purchase — one controlled order

**Execution record:** the authorized launch QA order was already completed on 2026-08-18 as a **$2 real discounted payment against the $49 Ultimate product**, and that exact order was fully refunded in §4. **Do not create another paid QA transaction without new authorization.** Use the existing transaction and provider evidence for the rows below; only re-observe non-destructive reporting/provider state as needed.

| # | Step | Expected |
|---|---|---|
| 3.1 | Buy from a homepage CTA with `?utm_source=qa&utm_medium=test&utm_campaign=verify` | Payhip checkout opens with the UTMs carried on the URL |
| 3.2 | Complete the order | Payhip delivers the files |
| 3.3 | Vercel logs | `[payhip] paid -> <tier> <txid>` and `[payhip] ga4 purchase recorded` |
| 3.4 | MailerLite | Added to `All Customers` + the matching tier; removed from `Leads` and `Refunded` |
| 3.5 | Buyer onboarding email | Arrives, correct edition, correct links |
| 3.6 | GA4 Realtime / DebugView | Exactly **one** `purchase`, correct `value`, `currency`, `transaction_id`, `items` |
| 3.7 | Ask Payhip to redeliver the same webhook if the dashboard supports safe redelivery | Second delivery returns 200 `duplicate_ignored`; no second MailerLite or GA4 side effect occurs |

## 4. Refund

**Execution record:** the controlled 2026-08-18 Ultimate QA order has already been fully refunded. Do not issue another refund or create a replacement paid order merely to repeat this section.

| # | Step | Expected |
|---|---|---|
| 4.1 | Refund the controlled order in full | Webhook returns 200 `refund_flagged` |
| 4.2 | MailerLite | Added to `Refunded`; removed from that tier, `Review Requested`, `Leads`; other valid tiers untouched; `All Customers` removed when no other paid tier remains. **Separately verify the already-running tier automation is canceled; the 2026-08-18 QA run exposed this as an open provider/UI defect.** |
| 4.3 | GA4 | One `refund` event with the refunded amount |
| 4.4 | Redeliver the same refund webhook if safe redelivery is available | 200 `duplicate_ignored`, no duplicate group churn or analytics side effect |

## 5. Transient-failure recovery

Only run this if you can simulate it safely — otherwise rely on the automated
coverage in `tests/test-webhook.mjs`, which asserts all of it.

| # | Step | Expected |
|---|---|---|
| 5.1 | Refund while MailerLite rejects a removal | Three attempts, then 500 `processing_failed` so Payhip retries |
| 5.2 | Let Payhip redeliver once MailerLite recovers | Cleanup completes; repeated delivery stays harmless |

## 6. Consent and analytics

| # | Step | Expected |
|---|---|---|
| 6.1 | First visit in a clean profile, DevTools → Network | **No** request to googletagmanager or Vercel Insights before a choice |
| 6.2 | Click Allow | GA4 and Vercel Analytics load exactly once; `landing_view` fires |
| 6.3 | Click a checkout CTA | `checkout_click` fires with tier, placement, value, and UTMs |
| 6.4 | Reopen the prompt and Decline | `ga-disable-*` set; no further site events |
| 6.5 | Reload | The decision persists |

## 7. First-screen interaction (the CRO gate)

| # | Step | Expected |
|---|---|---|
| 7.1 | Desktop, click **Skip intro** | The click lands on the control itself, not the header, and the page moves to the offer |
| 7.2 | Mobile (390px), tap **Skip intro** | Same, and it does not collide with the menu button |
| 7.3 | Keyboard: Tab to it, press Enter | Same result |
| 7.4 | Reduced motion enabled | Act 0 collapses to one screen; the offer is reachable without skipping |
| 7.5 | JavaScript disabled | The anchor still reaches the offer |

`npm run test:render` asserts every row in section 7 — re-run it rather than
checking by hand unless you are testing a real device.


## 8. Real-device acceptance

| # | Step | Expected |
|---|---|---|
| 8.1 | Real iPhone Safari: home, order, contact | No horizontal overflow; navigation, consent, CTA and forms are usable |
| 8.2 | VoiceOver on the same device | Landmarks, headings, controls and form labels are announced coherently; focus is not trapped |
| 8.3 | Open the Ultimate fillable PDF in the supported mobile/desktop reader path | A test field can be entered, saved, closed and reopened without losing the value |
| 8.4 | Payhip checkout on the real phone | Product/tier/price are correct and checkout remains usable before the authorized purchase |

## 9. Search and structured data

| # | Step | Expected |
|---|---|---|
| 9.1 | Rich Results Test on `/` and `/order.html` | Product and FAQ parse with no errors |
| 9.2 | Search Console → sitemap | Twelve canonical URLs, no unexpected exclusions |
| 9.3 | `curl -I https://www.familyfindersbook.com/index.html` | 308 to `/` |
| 9.4 | PageSpeed Insights, mobile and desktop, `/` and `/order.html` | LCP ≤ 2.5s, INP < 200ms, CLS < 0.1 |

## Sign-off

The release is verified when every row above has an observation recorded and no
row is failing. Anything left unverified goes in the PR description as
unverified — not as done.
