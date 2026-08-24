# Finder's Book GTM Autopilot v1 — Setup

## What runs where

| Platform | Role |
|---|---|
| GitHub repository | Public source of truth for Autopilot code, prompts, state templates, Phase 0 plan and daily plan |
| GitHub Actions | Scheduler, Phase 0 bootstrap runner, daily runner, approval interface and artifact host |
| OpenAI API + Agents SDK | Default GPT-5.6 Orchestrator, nine specialist agents, hosted web search, structured outputs and GPT Image 2 rendering |
| Gemini API | Explicitly selected text-orchestration fallback using Gemini 3.7 Flash and Google Search grounding; never replaces the creative providers |
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
- All new runtime snapshots require the independent `GTM_STATE_KEY`; the OpenAI key is not used for new state encryption.
- A legacy snapshot whose metadata says `openai` may still be decrypted with its prior OpenAI key exactly once, after which the next successful snapshot is persisted with `GTM_STATE_KEY` and metadata `state_key`.
- The state branch is replaced with a fresh root snapshot each persistence cycle so opaque encrypted history does not grow without bound.
- Generated media and EPUB binaries are uploaded as 30-day GitHub Actions artifacts and excluded from the encrypted Git branch snapshot.
- Provider media downloads are restricted to public HTTPS destinations; private/loopback/link-local/reserved IPs, redirects to those addresses, nonstandard ports and oversized downloads are rejected.
- The production workflow does not execute on pull requests, so PR-controlled code does not receive production provider secrets.
- Paid PDFs, paid EPUB source/manuscript, customer PII and secrets never belong on public `main`.

## GitHub secrets / variables

Required before autonomous `run` mode with the default provider:

- `OPENAI_API_KEY`
- `GTM_STATE_KEY` — independent high-entropy passphrase used only for encrypted Autopilot runtime state.

For an explicitly selected Gemini text-orchestration run, `GEMINI_API_KEY` replaces the OpenAI requirement for Phase 0/ordinary text units. `GTM_STATE_KEY` remains mandatory. A legacy state snapshot whose metadata says `openai` still needs its prior `OPENAI_API_KEY` for the one-time migration. Review the data-handling terms for the Google AI plan attached to the key before sending private business context.

Required when Day 6 or another video-rendering unit executes:

- `RUNWAYML_API_SECRET`

Optional repository variable:

- `GTM_OWNER_ALLOWLIST` — comma-separated GitHub logins authorized to resolve both YELLOW and RED gates; defaults to `miketui`.
- `GTM_MODEL_PROVIDER` — `openai` (default) or `gemini`; an explicit workflow-dispatch selection overrides it for that run.

Future integration credentials should be added only when their least-privilege adapters exist.

### Creating `GTM_STATE_KEY`

Generate a new value that is unrelated to OpenAI, Runway, passwords or any other account. Use at least 32 random bytes; 64 random password-manager characters or `openssl rand -base64 48` are appropriate. Store the value only as the GitHub Actions repository secret named exactly `GTM_STATE_KEY`. Do not commit it or paste it into chat.

## Dependency reproducibility

`gtm/autopilot/pyproject.toml` pins the primary Agents SDK and Runway SDK versions. `gtm/autopilot/uv.lock` is committed and production installs use:

```bash
uv sync --project gtm/autopilot --locked
```

## Approval model

- GREEN: autonomous research, analysis, private artifacts, repository QA and media rendering only when the active unit explicitly enables it and the hard budget ceiling is respected.
- YELLOW: publish/send, paid-campaign activation, external outreach, price/offer changes, merge/deploy, or exceeding a configured creative/spend ceiling. An authenticated actor in `GTM_OWNER_ALLOWLIST` is required to resolve the gate.
- RED: banking/tax/identity/legal/contract/credential/physical-proof actions. An authenticated actor in `GTM_OWNER_ALLOWLIST` is required; RED never becomes non-blocking from model output.

## Creative production budget

`creative-budget.json` currently limits a Day 6 run to:

- exactly 15 GPT Image 2 image jobs for the configured Day 6 batch;
- exactly 5 Runway Gen-4.5 video jobs;
- 5 seconds maximum per video;
- 25 total video seconds maximum;
- 300 Runway credits maximum using the 12-credits/second guardrail.

The Day 6 pass gate requires 20 distinct successfully rendered outputs: five video drafts, five video reference stills, five carousel master graphics and five Pinterest Pins. Provider kill switches and required credentials are checked before any paid rendering begins. Synthetic physical-product proof is prohibited.

## EPUB workstream

The public repo contains only the EPUB builder and source-free template. The real manuscript must be generated from the full authoritative source in private runtime storage:

`$GTM_RUNTIME_ROOT/ebook/ebook-manuscript.json`

The private manuscript must contain a stable `metadata.identifier` before the first build. The builder rejects malformed XHTML instead of packaging an invalid EPUB.

Use the GitHub Actions `ebook-build` dispatch mode, which routes through the hardened control plane. The finished EPUB remains a private Actions artifact until validation and owner approval. See `ebook/README.md`.

## Scheduler

The scheduler runs at `15:00 UTC`, which is 8:00 AM PDT during the initial launch window. The state machine prevents two successful 30-day units from being consumed on the same Los Angeles calendar date.

The one-time merge commit marker `[gtm-autopilot-bootstrap]` starts Phase 0 after merge. Ordinary future pushes to `main` do not advance the GTM clock.
