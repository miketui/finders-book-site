# Finder's Book GTM Autopilot v1 — Setup

## What runs where

| Platform | Role |
|---|---|
| GitHub repository | Public source of truth for the Autopilot engine, state schemas and configuration templates |
| GitHub Actions | Daily scheduler and autonomous runner |
| OpenAI API + Agents SDK | Orchestrator reasoning, seven specialist agents and structured daily output |
| Encrypted state branch | Stores only `gtm/runtime-state.enc`; plaintext Founder Briefs, metrics, experiments and approvals are never committed to the public repository |
| Vercel | Existing production website only; `/gtm/` is excluded from deployment |
| MailerLite | Lead/buyer email execution after API/connector wiring and approval |
| Payhip | Existing digital commerce; authoritative digital purchase/refund source |
| Lulu Direct | Physical hero checkout/fulfillment; normal Direct Checkout Link from website |
| GA4 / Search Console / Ads | Measurement and acquisition inputs once credentials/API access are wired |
| Etsy / Amazon KDP / B&N / IngramSpark | Marketplace/distribution execution surfaces; publishing remains approval-gated |
| Optional Composio/MCP middleware | Recommended bridge when a platform lacks a clean direct API or when one broker can standardize multiple tools |

## Security boundary

The repository is public, so the code/configuration may be public but runtime business intelligence must not be.

- `gtm/reports/` and `gtm/runtime-state.enc` are ignored by Git.
- `/gtm/` is excluded from Vercel deployment.
- The production Autopilot workflow does **not** execute on pull requests and therefore does not expose the OpenAI secret to PR-controlled code.
- Pull requests continue to use the repository's protected static and rendered-page validation before merge.
- Runtime state is bundled and encrypted before it is written to the isolated state branch.

## One-time setup

1. Merge the Autopilot PR only after protected checks pass.
2. In GitHub → Settings → Secrets and variables → Actions, add `OPENAI_API_KEY` using an active OpenAI project API key. Never commit it to the repository.
3. Recommended: add a separate high-entropy `GTM_STATE_KEY` secret **before the first state-persisting run**. If it is absent, the normalized OpenAI API key itself is used as the PBKDF2 passphrase. If you later rotate that fallback key, migrate or reset the encrypted state first.
4. Optional: set repository variable `GTM_OWNER_ALLOWLIST` to a comma-separated list of GitHub logins authorized to resolve RED approval gates. It defaults to `miketui`.
5. Keep workflow permission at `contents: write`; runtime state is written only to the dedicated `gtm-autopilot-state` branch. The workflow does not push runtime state to protected `main`.
6. The merge commit carrying `[gtm-autopilot-bootstrap]` performs the one-time Day 1 bootstrap. Ordinary future pushes to `main` do not advance the GTM clock.
7. Use `workflow_dispatch` with `mode=approve` or `mode=reject` plus an approval ID to resolve gates. GitHub passes the authenticated actor to the runner.
8. Add platform credentials incrementally. Do not add them until the corresponding adapter exists and has least-privilege scopes.

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
The marketing state belongs with the GTM operating system and needs auditable execution, approval records and repository QA context. GitHub Actions is the cleaner first scheduler. Vercel stays focused on serving the customer-facing website.

## Approval model

- GREEN actions may run autonomously.
- YELLOW actions are prepared automatically and stop until owner approval when marked blocking.
- RED actions are always blocking and are never performed automatically. A RED approval decision is accepted only when the authenticated GitHub actor is in `GTM_OWNER_ALLOWLIST`.

No workflow may spend money, publish externally, send customer/partner messages, merge a PR, deploy production, change a price, or accept a legal agreement without the required approval.

## GitHub settings

Required secret:

`OPENAI_API_KEY`

Recommended independent state-encryption secret:

`GTM_STATE_KEY`

Optional repository variable:

`GTM_OWNER_ALLOWLIST`

Optional future secrets should be added only when adapters are implemented, for example:
`MAILERLITE_API_KEY`, `GA4_*`, advertising API credentials, marketplace API credentials.

## Runtime output

A successful run creates plaintext working files only inside the ephemeral Actions runner, including filenames such as:

- `/gtm/reports/<date>-day-01-<run_id>.json`
- `/gtm/reports/<date>-day-01-<run_id>-founder-brief.md`
- updated `state.json`
- updated approval queue if any

Each execution generates one collision-resistant `run_id`, reused in the report names and approval IDs. Before persistence, these files are bundled and encrypted into `gtm/runtime-state.enc`; only the encrypted bundle is committed to the isolated state branch.

## Daily schedule

The scheduler runs at `15:00 UTC`, which is 8:00 AM PDT during the initial launch window. GitHub cron is UTC-based, so the local wall-clock time changes when Los Angeles leaves daylight-saving time.
