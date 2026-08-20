# Finder's Book GTM Autopilot v1 — Setup

## What runs where

| Platform | Role |
|---|---|
| GitHub repository | Public source of truth for Autopilot code, prompts, state templates, Phase 0 plan and daily plan |
| GitHub Actions | Scheduler, Phase 0 bootstrap runner, daily runner, approval interface and artifact host |
| OpenAI API + Agents SDK | GPT-5.6 Orchestrator, nine specialist agents, hosted web search, structured outputs and GPT Image 2 rendering |
| Runway API | Gen-4.5 video rendering for explicitly enabled creative-production units |
| Encrypted state branch | Stores only the newest encrypted runtime snapshot + non-secret key-scheme metadata |
| GitHub Actions artifacts | Stores generated image/video/EPUB binaries temporarily; these are not committed to the public repo |
| Vercel | Existing production website only; `/gtm/` remains excluded from deployment |
| MailerLite | Lead/buyer email execution after connector/API wiring and approval |
| Payhip | Existing digital commerce and authoritative digital purchase/refund source |
| Lulu Direct | Physical hero checkout/fulfillment via normal Direct Checkout Link |
| GA4 / Search Console / Ads | Measurement and acquisition inputs as adapters are connected |
| Etsy / Amazon KDP / B&N / IngramSpark | Marketplace/distribution surfaces; publication remains approval-gated |

## Execution order

The first real `run` begins in `PHASE0`, not Day 1.

`Section 12 → 1 → 2 → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 11 → 5 → Foundation QA → Day 1`

The bootstrap workflow runs the remaining Phase 0 units sequentially in one Actions run and stops immediately on a blocking approval, BLOCKED result or PARTIAL result. Day 1 cannot leapfrog a failed foundation.

Section 10 creates the creative master specification. It does not execute the large paid render batch. Day 6 is the first large autonomous rendering batch.

## Nine agents

SEO, Content, Growth, Commerce, Analytics, Partnerships, Release/QA, Creative Production and Ebook Production.

- `CREATIVE_PRODUCTION`: GPT Image 2 stills + Runway Gen-4.5 video specifications/rendering inside hard ceilings.
- `EBOOK_PRODUCTION`: separate non-fillable EPUB reading-edition architecture/build; never uploads the current fillable PDF unchanged.

## Security boundary

The repository is public, so runtime business intelligence and paid source material stay outside it.

- Mutable state runs under the GitHub runner's temporary directory via `GTM_RUNTIME_ROOT`.
- Repo validation sees only immutable checked-in templates, preventing runtime state from invalidating file manifests.
- Runtime state, Founder Briefs and Phase 0 foundation files are bundled and encrypted before persistence.
- The state branch is replaced with a fresh root snapshot each persistence cycle so opaque encrypted history does not grow without bound.
- Generated media and EPUB binaries are uploaded as 30-day GitHub Actions artifacts and excluded from the encrypted Git branch snapshot.
- The production workflow does not execute on pull requests, so PR-controlled code does not receive production provider secrets.
- Paid PDFs, paid EPUB source/manuscript, customer PII and secrets never belong on public `main`.

## GitHub secrets / variables

Required:

- `OPENAI_API_KEY`
- `RUNWAYML_API_SECRET` — required when a video-rendering unit executes; the current user has added the Runway secret in GitHub.

Recommended:

- `GTM_STATE_KEY` — independent high-entropy encryption passphrase. If absent, the current OpenAI key is used only as the state-encryption fallback. State snapshots record which key scheme was used, allowing later migration to `GTM_STATE_KEY` without making old ciphertext unreadable.

Optional repository variable:

- `GTM_OWNER_ALLOWLIST` — comma-separated GitHub logins authorized to resolve RED gates; defaults to `miketui`.

Future integration credentials should be added only when their least-privilege adapters exist.

## Dependency reproducibility

`gtm/autopilot/pyproject.toml` pins the primary Agents SDK and Runway SDK versions. `gtm/autopilot/uv.lock` is generated on the PR branch by the lock/manifest workflow and production installs use:

```bash
uv sync --project gtm/autopilot --locked
```

## Approval model

- GREEN: autonomous research, analysis, private artifacts, repository QA and media rendering only when the active unit explicitly enables it and the hard budget ceiling is respected.
- YELLOW: publish/send, paid-campaign activation, external outreach, price/offer changes, merge/deploy, or exceeding a configured creative/spend ceiling.
- RED: banking/tax/identity/legal/contract/credential/physical-proof actions; RED decisions require an authenticated actor in `GTM_OWNER_ALLOWLIST`.

## Creative production budget

`creative-budget.json` currently limits a Day 6 run to at most:

- 15 GPT Image 2 image jobs;
- 5 Runway Gen-4.5 videos;
- 5 seconds per video;
- 25 total video seconds;
- 300 Runway credits using the 12-credits/second guardrail.

Target Day 6 output: five video drafts, five video reference stills, five carousel master graphics and five Pinterest Pins. Synthetic physical-product proof is prohibited.

## EPUB workstream

The public repo contains only the EPUB builder and source-free template. The real manuscript must be generated from the full authoritative source in private runtime storage:

`$GTM_RUNTIME_ROOT/ebook/ebook-manuscript.json`

Then run:

```bash
uv run --project gtm/autopilot python gtm/autopilot/main.py --mode ebook-build
```

The finished EPUB remains a private Actions artifact until validation and owner approval. See `ebook/README.md`.

## Scheduler

The scheduler runs at `15:00 UTC`, which is 8:00 AM PDT during the initial launch window. The state machine prevents two successful 30-day units from being consumed on the same Los Angeles calendar date.

The one-time merge commit marker `[gtm-autopilot-bootstrap]` starts Phase 0 after merge. Ordinary future pushes to `main` do not advance the GTM clock.
