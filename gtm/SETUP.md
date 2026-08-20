# Finder's Book GTM Autopilot v1 — Setup

## What runs where

| Platform | Role |
|---|---|
| GitHub repository | Public source of truth for GTM engine, prompts, state schema and workflow code only |
| GitHub Actions | Daily scheduler and autonomous runner |
| OpenAI API + Agents SDK | Orchestrator reasoning, seven specialist agents, structured daily output and traces |
| Encrypted `gtm-autopilot-state` branch | Durable runtime memory; Founder Briefs, metrics, experiments and approval details are encrypted before persistence |
| Vercel | Existing production website only; `/gtm/` is excluded from deployment |
| MailerLite | Lead/buyer email execution after API/connector wiring and approval |
| Payhip | Existing digital commerce; authoritative digital purchase/refund source |
| Lulu Direct | Physical hero checkout/fulfillment; normal Direct Checkout Link from website |
| GA4 / Search Console / Ads | Measurement and acquisition inputs once credentials/API access are wired |
| Etsy / Amazon KDP / B&N / IngramSpark | Marketplace/distribution execution surfaces; publishing remains approval-gated |
| Optional Composio/MCP middleware | Recommended bridge when a platform lacks a clean direct API or when one broker can standardize multiple tools |

## Privacy boundary

The website repository is public. The Autopilot engine can safely live in public source control, but live business intelligence must not.

The workflow therefore:
1. Keeps checked-in `state.json`, `metrics.json`, `experiments.json` and `approvals.json` as empty/bootstrap templates.
2. Runs the agent with plaintext runtime data only inside the GitHub Actions runner.
3. Packages live state plus Founder Briefs/reports into a tar archive.
4. Encrypts that archive with AES-256-CBC + PBKDF2 before writing it to `gtm-autopilot-state`.
5. Commits only `gtm/runtime-state.enc` to the state branch.
6. Decrypts the state inside the next authorized workflow run.

By default the encryption key is deterministically derived inside the runner from `OPENAI_API_KEY` without printing the key. For stronger key separation, add a separate GitHub Actions secret named `GTM_STATE_KEY`; the workflow automatically prefers it when present. If the OpenAI key is rotated before `GTM_STATE_KEY` is configured, archive the current encrypted runtime state or intentionally reset the GTM state before rotation.

## One-time setup

1. Merge the Autopilot PR only after protected checks and the PR-only OpenAI dry run pass.
2. In GitHub → Settings → Secrets and variables → Actions, add `OPENAI_API_KEY` using the key created in the OpenAI Platform setup flow. Never commit it to the repo.
3. Optional but recommended later: add an independent `GTM_STATE_KEY` secret for encryption-key separation.
4. The merge commit uses a one-time `[gtm-autopilot-bootstrap]` marker, causing Day 1 to run once after merge.
5. Scheduled runs then execute daily at 15:00 UTC (08:00 PDT during the initial 30-day window).
6. Use `workflow_dispatch` with `mode=approve` or `mode=reject` plus an approval ID to resolve gates.
7. Add platform credentials incrementally. Do not add them until the corresponding adapter exists and has least-privilege scopes.

## Recommended execution stack

### Core (required)
- GitHub + GitHub Actions
- OpenAI API / Agents SDK
- Existing Vercel project

### Data/marketing integrations (phase 2)
- GA4 + Search Console for measurement
- MailerLite for email
- Payhip for digital orders/refunds
- Lulu Direct for physical order data where available
- Google Ads, Meta, Pinterest, Etsy Ads, Amazon Ads for campaign read/write APIs

### Why not make Vercel the scheduler?
The marketing state belongs with an auditable automation runner and needs approval records, repeatable schedules and source-control context. GitHub Actions is the cleaner first scheduler. Vercel stays focused on serving the customer-facing website.

## Approval model

- GREEN actions may run autonomously.
- YELLOW actions are prepared automatically and stop until owner approval.
- RED actions are never performed by the agent.

No workflow may spend money, publish externally, send customer/partner messages, merge a PR, deploy production, change a price, or accept a legal agreement without the required approval.

## GitHub secrets

Required:
- `OPENAI_API_KEY`

Optional/recommended:
- `GTM_STATE_KEY` — independent encryption key for runtime-state separation

Future adapter secrets should be added only when the adapter exists, for example:
`MAILERLITE_API_KEY`, `GA4_*`, advertising API credentials, marketplace API credentials.

## PR dry run

Changes to the GTM engine or workflow trigger a PR-only dry run. It calls the real OpenAI agent path and repository QA but discards all generated runtime files afterward. This proves the engine without advancing the 30-day state machine.

## First live run

When the approved PR is merged with `[gtm-autopilot-bootstrap]` in the merge commit title, GitHub Actions runs Day 1 once and stores its live runtime output only inside the encrypted state bundle.

Public CI logs expose only a safe status summary: active day, PASS/PARTIAL/BLOCKED/AWAITING_APPROVAL state, approval count, blocker count and repository-QA result. Detailed Founder Briefs, metrics and approval reasons are not printed to public logs.
