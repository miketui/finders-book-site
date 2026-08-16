# Implementation brief — Act Zero redesign, live site port

Source of truth: `docs/redesign-direction.html` (rationale) and
`docs/redesign-mock.html` (working markup, CSS and motion logic).
This brief is the execute-ready instruction for porting that mock into
the shipping site. Paste it back to me verbatim to kick off the work,
or edit it first if you want to change scope.

## Non-negotiable preservation list

Do not rename, remove, or alter the value of any of the following.
Relocating the element that carries them is fine; changing the
attribute is not.

- Every `data-checkout`, `data-placement`, `data-tier`, `data-price`
  attribute and its exact string value, on every CTA in `index.html`.
- All three Payhip URLs (`/b/Y1O7B`, `/b/eHcPG`, `/b/xPuv4`).
- Every `id` targeted by an in-page anchor: `#pricing`, `#inside`,
  `#start`, `#gap-check`, `#security`, `#creators`, `#faq`, `#final-cta`,
  `#top`, `#main`.
- `consent.js`, `analytics.js`, `chrome.js` — not touched. GA4 property
  `G-ZXX0M4VYT5`, gtag consent-mode calls, MailerLite endpoints, and the
  `fbq`/`plausible`/Vercel Analytics hooks in `analytics.js` are
  untouched.
- The full `application/ld+json` graph in `index.html` (Organization,
  Brand, WebSite, WebPage, Product, AggregateOffer, FAQPage) —
  byte-identical.
- `<title>`, meta description, canonical, robots, OG/Twitter tags, and
  the `<h1>` text — byte-identical.
- `sitemap.xml`, `robots.txt`, and every route in `about.html`,
  `order.html`, `contact.html`, the three policy pages — untouched.
- The CSP in `vercel.json` — no new external host is introduced by this
  work (GSAP/ScrollTrigger/SplitText/Lenis are already whitelisted).
- The reduced-motion floor: every new animation ships with its
  `prefers-reduced-motion` fallback in the same commit that adds it,
  not as a follow-up.

## Scope: style, layout, sequence, and motion only

No copy is rewritten. Where the direction doc's acts reuse existing
section copy verbatim (the doctrine list, the FAQ answers, the bonus
descriptions), copy it forward unchanged. Do not "improve" sentences
in transit.

## Files touched

`index.html`, `styles.css`, `motion.js`. Nothing else. No new
dependency, no build step, no framework.

## Build order — four shippable passes

### Pass 1 — Act 0, behind a flag
- Port the `#call` section from `redesign-mock.html` into `index.html`,
  positioned before the existing `<section class="hero">`.
- Port `.call-*` styles into `styles.css`, including the
  `prefers-reduced-motion` collapse.
- Port the scroll-scrub logic into `motion.js`, following the existing
  `gsap.matchMedia()` gating pattern already used in that file rather
  than the mock's vanilla-JS version.
- Add the warm-traffic compression rule: any arrival with a `#anchor`,
  a returning-session flag, or a `utm_medium` param collapses Act 0 to
  a single 70vh statement before the reveal.
- Suppress the header CTA and sticky bar (`#sticky`) until 3500ms after
  the reveal fires; add the "Skip" affordance.
- Gate the whole section behind a flag (env var, query param, or
  cookie — your call) so it can run as an A/B split.
- **Ship and measure alone before Pass 2.** Success condition: does not
  reduce `checkout_click` events while increasing scroll depth past
  `#pricing`. Do not proceed to Pass 2 until this is read.

### Pass 2 — Hero becomes the Reveal; Snapshot gets its own act
- Rebuild `.hero` per the mock's `#reveal` section: delete
  `.journey-strip`; fold `.proof-strip` into the hero base as the
  4-item `.fact-rail`; cut to one CTA (`hero-preview` link becomes a
  quiet text link, same `data-placement`).
- Replace `@keyframes bookSpin` (infinite) with the single 214°
  landing rotation from the mock, on the existing
  `cubic-bezier(.22,1,.36,1)` token.
- Move the Continuity Snapshot card out of `.hero-grid` into its own
  new section (Act III in the doc), at full scale, with the Write-in
  stagger attached.

### Pass 3 — Gallery restage + two merges
- Restage `.gallery` from 12 buttons to 5, scroll-scrubbed
  (`redesign-mock.html`'s `#spread` pattern). Move the other 7
  `.pg` buttons into a "see all 49" overlay/dialog — same
  `data-full`/`data-cap` lightbox bindings, just relocated.
- Merge the bonuses band and the formats band into one "What arrives"
  section.
- Merge the "who it's for" band and the "creators" band into one trust
  section, with creator transparency demoted to a 3-field footer.

### Pass 4 — Pricing ledger, FAQ collapse, Strike motion
- Re-cut `.tiers` from 3 towers to 3 ledger rows. Same prices, same
  Payhip links, same `data-tier`/`data-price`. Recommended tier signalled
  by background inversion + weight; delete `.tier-flag`.
- Move the "15-minute start" section to sit immediately above pricing.
- Collapse the FAQ `<details>` list underneath the Gap Check section;
  delete the FAQ's standalone band. `FAQPage` JSON-LD stays as-is.
- Add the Strike motion (340ms, 60ms stagger) to `.doc-no` in the
  security doctrine section.

## Verification, every pass

1. `npm run validate` (secrets, refs, chrome-drift, CSP, HTML checks,
   full test suite) — must exit 0.
2. A Playwright pass at 1280×860 and 390×844: zero console errors, zero
   horizontal overflow, every above-the-fold element has non-zero
   opacity and size (this is exactly what `test:render` already checks
   for — extend its assertions to the new sections rather than writing
   a parallel script).
3. A `prefers-reduced-motion: reduce` pass confirming every new
   animation collapses to a static, legible state.
4. Manual: confirm every `data-checkout` link still fires
   `checkout_click` with its original `placement`/`tier`/`price` in
   the browser console with GA4 debug mode on.

## Definition of done

All four passes shipped, `npm run validate` green, CI green, and the
non-negotiable preservation list above verified item-by-item in the
final diff against `main`.
