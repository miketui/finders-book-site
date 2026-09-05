# Payhip overlay and post-purchase return

Site-side checkout lives in `analytics.js`. Product slugs stay:

| Edition | Slug | URL |
|---|---|---|
| Essentials | `eHcPG` | `https://payhip.com/b/eHcPG` |
| Ultimate | `Y1O7B` | `https://payhip.com/b/Y1O7B` |
| Family Bundle | `xPuv4` | `https://payhip.com/b/xPuv4` |

This file records what the **website** does and what still requires a Payhip dashboard change. Nothing below is a claim that the Payhip admin was edited.

## What the site already does

- Checkout links keep the live `/b/{slug}` hrefs and are rewritten to Payhip **direct checkout** (`/buy?link={slug}`) so a no-JS or new-tab click skips the Payhip product listing.
- When `https://payhip.com/payhip.js` loads, a left-click opens Payhip’s **in-page overlay** instead of navigating away. Overlay miss, script block, or modifier-click still uses `/buy?link=`.
- Overlay options pass `successUrl` / `redirect` pointing at `https://www.familyfindersbook.com/start.html` **if** Payhip’s script honors those keys. That is not documented as a public API. Treat it as best-effort only.
- If a same-origin-allowed `postMessage` from `payhip.com` looks like a completed purchase, the site assigns `/start.html`. Cross-origin checkout UI cannot be styled from this repo.
- Best-effort CSS hides Payhip “sale” badges **only if they are injected into our document**. Badges inside the Payhip iframe cannot be hidden from site CSS.

## APPROVAL NEEDED — Payhip dashboard (Michael)

Do not flip these until Michael approves. They change live checkout behavior.

1. **Post-purchase return to `/start` (required for a reliable branded return)**
   - Path: Account → Settings → Advanced Settings → Checkout Settings
   - Enable: “Redirect customers to a particular webpage when they successfully complete the checkout”
   - URL: `https://www.familyfindersbook.com/start.html`
   - Apply to all three products (`eHcPG`, `Y1O7B`, `xPuv4`)
   - Tradeoff Payhip documents: buyers will **not** see the in-overlay instant download after pay. `/start` already tells them to check the Payhip email for the file. Confirm that MailerLite/Payhip receipt copy still points at the download before enabling.

2. **“On Sale” presentation (only if the overlay or `/buy` page still shows it)**
   - Overlay + `/buy?link=` already skip the storefront product card, which is where Payhip usually prints “On Sale”.
   - If a sale badge or compare-at price still appears in checkout, that is a **product price setting** in the Payhip editor (sale / compare-at / strikethrough), not something this repo can suppress inside their iframe.
   - Approval ask: remove sale / compare-at pricing on Essentials, Ultimate, and Family Bundle if Michael wants that chrome gone. Do not change the live $29 / $49 / $89 prices unless he asks.

3. **Do not change**
   - Product slugs
   - Attached ZIP files
   - Webhook URL
   - Domain / DNS

## After a dashboard change

Record the date and who flipped the setting in `docs/OWNER-ACTIONS.md`. Re-check one controlled order: pay → land on `/start` → email still has the download → webhook still maps the slug.
