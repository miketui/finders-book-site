# Finder's Book GTM Autopilot v1 — Setup

## What runs where

| Platform | Role |
|---|---|
| GitHub repository | Source of truth for GTM code, state schema, reports and approval records |
| GitHub Actions | Daily scheduler and autonomous runner |
| OpenAI API + Agents SDK | Orchestrator reasoning, seven specialist agents, structured daily output and traces |
| Vercel | Existing production website only; GTM Autopilot does not replace hosting |
| MailerLite | Lead/buyer email execution after API/connector wiring and approval |
| Payhip | Existing digital commerce; authoritative digital purchase/refund source |
| Lulu Direct | Physical hero checkout/fulfillment; normal Direct Checkout Link from website |
| GA4 / Search Console / Ads | Measurement and acquisition inputs once credentials/API access are wired |
| Etsy / Amazon KDP / B&N / IngramSpark | Marketplace/distribution execution surfaces; publishing remains approval-gated |
| Optional Composio/MCP middleware | Recommended bridge when a platform lacks a clean direct API or when one broker can standardize multiple tools |

## One-time setup

1. Merge the Autopilot PR only after protected checks pass.
2. In GitHub → Settings → Secrets and variables → Actions, add `OPENAI_API_KEY` using the key created in the OpenAI Platform setup flow. Never commit it to the repo.
3. Keep workflow permission at `contents: write`; the runner writes only to a dedicated `gtm-autopilot-state` branch. It does not push to protected `main`.
4. Run the workflow manually with `mode=run` once. Confirm the Founder Brief and state branch are created.
5. Use `workflow_dispatch` with `mode=approve` or `mode=reject` plus an approval ID to resolve gates.
6. Add platform credentials incrementally. Do not add them until the corresponding adapter exists and has least-privilege scopes.

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
The marketing state belongs with the repo and needs auditable commits, approval records, and PR context. GitHub Actions is the cleaner first scheduler. Vercel stays focused on serving the customer-facing website.

## Approval model

- GREEN actions may run autonomously.
- YELLOW actions are prepared automatically and stop until owner approval.
- RED actions are never performed by the agent.

No workflow may spend money, publish externally, send customer/partner messages, merge a PR, deploy production, change a price, or accept a legal agreement without the required approval.

## GitHub secret required

`OPENAI_API_KEY`

Optional future secrets should be added only when adapters are implemented, for example:
`MAILERLITE_API_KEY`, `GA4_*`, advertising API credentials, marketplace API credentials.

## First run

GitHub → Actions → `Finder's Book GTM Autopilot` → Run workflow → mode `run`.

The first run should produce:
- `/gtm/reports/<date>-day-01.json`
- `/gtm/reports/<date>-day-01-founder-brief.md`
- updated `state.json`
- updated approval queue if any

These runtime files live on the `gtm-autopilot-state` branch so protected `main` remains clean.
