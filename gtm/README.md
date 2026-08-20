# Finder's Book GTM Autopilot v1

A guarded, repo-native autonomous growth operating system for The Finder's Book.

## Execution model

### Phase 0 — Foundation
Before Day 1, the system executes all 12 AGM section prompts in the dependency order defined by `phase0-plan.json`:

`12 → 1 → 2 → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 11 → 5 → Foundation QA`

Section 12 verifies sources first. Section 5 synthesizes the completed foundation last. Day 1 cannot begin until Foundation QA passes.

### Phase 1 — 30-Day GTM
One GTM unit is allowed to complete per Los Angeles calendar day. The daily runner consumes the Phase 0 foundation instead of recreating strategy each day.

Day 6 is the first large autonomous creative rendering batch, using GPT Image 2 for stills and Runway Gen-4.5 for video within `creative-budget.json` ceilings. Generated media is staged only; publishing remains approval-gated.

### Phase 2 — Continuous Growth
After Day 30, the state machine changes to evidence-led weekly Continuous Growth Mode.

## Nine specialist agents

1. SEO
2. Content
3. Growth
4. Commerce
5. Analytics
6. Partnerships
7. Release / QA
8. Creative Production
9. Ebook Production

`CREATIVE_PRODUCTION` turns Content specifications into guarded media jobs. `EBOOK_PRODUCTION` creates a distinct non-fillable EPUB reading-edition workstream; it must never upload or mechanically convert the current fillable PDF unchanged.

## Runtime and privacy

The public repository stores only code, prompts, plans and empty state templates. Mutable GTM state, Founder Briefs, foundation outputs and private business intelligence run outside the checked-out website tree and are encrypted before persistence. Generated media is uploaded as time-limited GitHub Actions artifacts rather than committed to the public repository.

Paid Finder's Book source files, buyer deliverables, customer PII and secrets do not belong in this public repository.

## Approval model

- GREEN: research, analysis, private artifacts, QA and explicitly budgeted rendering.
- YELLOW: publishing/sending, paid-campaign activation or material changes, external outreach, production merge/deploy, or exceeding a configured ceiling.
- RED: owner-only banking/tax/identity/legal/contract/credential/physical-proof actions.

See `SETUP.md` for platform wiring and `ebook/README.md` for the separate EPUB workstream.
