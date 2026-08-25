# Finder's Book GTM Autopilot Roadmap

This document explains what the Autopilot completes, what the owner controls,
and what comes after the Phase 0 Foundation Binder. The current source of truth
for machine execution remains `phase0-plan.json`, `day-plan.json`, the approval
ledger, and the encrypted runtime state.

## Phase 0 — Foundation

Phase 0 builds the private strategy and operating foundation before Day 1. It
runs in this dependency order:

1. Section 12 — verify and classify repository, product, marketplace, and
   platform claims.
2. Section 1 — define product formats, channel roles, prices, go/no-go gates,
   and the separate non-fillable ebook reading-edition architecture.
3. Section 2 — build the emotional message, safety, CTA, and content framework.
4. Section 3 — map search intent, keywords, pages, internal links, and the SEO
   backlog.
5. Section 4 — design organic, paid, partner, referral, attribution, and traffic
   systems without activating spend or outreach.
6. Section 6 — stage the Etsy physical-edition listing and fulfillment package.
7. Section 7 — stage the Amazon KDP paperback metadata, preflight, proof, and
   advertising package.
8. Section 8 — stage the Lulu Direct coil-edition, proof, checkout, tracking,
   and buyer-segmentation package.
9. Section 9 — calculate pricing, fees, contribution margins, CPA ceilings,
   break-even ROAS, and sensitivity ranges.
10. Section 10 — create the creative master system, 30 hooks, 12 content
    packages, 30 promotion plays, and the Day 6 render specification. Phase 0
    does not run the large paid rendering batch.
11. Section 11 — define the KPI dashboard, attribution rules, baselines, data
    gaps, and seven-day decision rules.
12. Section 5 — reconcile every earlier section into the 30-day command center.
13. Foundation QA — require all sections, artifacts, canonical decisions,
    reconciliation, repository QA, and blocking-approval checks to pass.

When Foundation QA passes, the state advances to `THIRTY_DAY` with Day 1 ready.
It does not automatically execute Day 1 in the same unit.

## Phase 1 — 30-Day GTM

Only one successful daily unit may be consumed per Los Angeles calendar date.
Private drafting and analysis may run autonomously; external or consequential
actions remain approval-gated.

1. Day 1 — lock the offer, funnel, attribution convention, and KPI baseline.
2. Day 2 — build the SEO keyword-to-page map.
3. Day 3 — prepare and preflight the physical print master.
4. Day 4 — prepare the Amazon KDP metadata package.
5. Day 5 — prepare the Etsy shop and listing architecture.
6. Day 6 — render the first bounded creative batch: five video drafts, five
   video reference stills, five carousel graphics, and five Pinterest Pins.
7. Day 7 — complete final pre-traffic conversion and analytics QA.
8. Day 8 — prepare the Google Search launch test with its budget ceiling.
9. Day 9 — prepare Pinterest organic and paid discovery packages.
10. Day 10 — prepare the Meta launch test after event QA.
11. Day 11 — prepare SEO cornerstone asset 1 and its repurposing package.
12. Day 12 — build the partner list and first outreach drafts.
13. Day 13 — design the Pain, Relief, and Dream creative test.
14. Day 14 — run the Week 2 optimization review.
15. Day 15 — prepare the Lulu proof and Direct setup package.
16. Day 16 — prepare the proof-dependent Etsy launch package.
17. Day 17 — prepare the Amazon KDP submission package.
18. Day 18 — prepare Amazon detail-page and Sponsored Products assets.
19. Day 19 — prepare physical-edition discovery content, website routing, and
    `physical_checkout_click` measurement.
20. Day 20 — prepare the segmented physical-edition email package.
21. Day 21 — perform the marketplace quality review.
22. Day 22 — mine Google search terms, negatives, and landing-page decisions.
23. Day 23 — prepare Meta retargeting creative and audience logic.
24. Day 24 — identify or mark unverified the best Pinterest concept and prepare
    two variants.
25. Day 25 — prepare the proof-gated Etsy Ads test.
26. Day 26 — prepare the Amazon Sponsored Products launch package.
27. Day 27 — prepare SEO cornerstone asset 2 or 3.
28. Day 28 — prepare micro-influencer and educator outreach drafts.
29. Day 29 — evaluate the offer stack; unapproved bundle prices remain
    hypotheses.
30. Day 30 — complete the executive review and Continuous Growth transition.

## Phase 2 — Continuous Growth

After Day 30, the state changes to `CONTINUOUS_GROWTH` and follows this weekly
evidence-led cadence:

- Monday — analytics and SEO opportunity discovery.
- Tuesday — content and creative production.
- Wednesday — distribution and partnerships.
- Thursday — optimization and experiments.
- Friday — marketplace and B2B development.
- Saturday — evergreen content and creative refresh.
- Sunday — executive review and next-week planning.

## Owner controls

- `status` reads the current state without advancing it.
- `run` executes only the current eligible unit.
- `approve` or `reject` resolves one named pending approval and requires its
  exact safe approval ID.
- `ebook-ingest` and `ebook-build` operate the separate private reading-edition
  workstream.
- The Foundation Export workflow creates a short-lived encrypted Phase 0
  download and never advances state.

Approval classes:

- GREEN — private research, analysis, drafts, QA, and explicitly budgeted
  rendering.
- YELLOW — publishing, sending, outreach, spend activation, price changes,
  merge, or deployment.
- RED — owner-only banking, tax, identity, legal, contract, credential, and
  physical-proof actions.

Never paste `GEMINI_API_KEY`, `OPENAI_API_KEY`, `RUNWAYML_API_SECRET`, or
`GTM_STATE_KEY` into chat, an issue, a pull request, or a workflow input.

## Code-change certification

Every Autopilot code or workflow change must pass these six gates on the same
exact commit before merge:

1. Static Validation.
2. Rendered-page Smoke Test.
3. GTM Autopilot Validation.
4. GTM Autopilot Final Hardening.
5. Manifest Verification.
6. GTM v1.1 Usability Validation.

After code merges, use `status` to confirm the preserved live state before any
new `run`. Do not use a bootstrap marker for ordinary fixes or restarts.

## Getting the Phase 0 Binder

1. In GitHub, open **Actions → Finder's Book GTM Foundation Export**.
2. Choose **Run workflow** on `main`.
3. Download the one-day Actions artifact when the workflow succeeds.
4. Keep the encrypted binder, its `.hmac`, and `README-DECRYPT.txt` together.
5. Verify the HMAC before decrypting by following `README-DECRYPT.txt`.
6. Store the decrypted Binder privately; do not commit it to the public repo.
