# Deployment runbook

## Current production target

- Vercel project: `finders-book-v34`
- Vercel team: `mikes-projects-1e9a868e`
- Canonical production URL: `https://www.familyfindersbook.com`
- Redirecting apex domain: `https://familyfindersbook.com`
- Protected Vercel alias: `https://finders-book-v34.vercel.app`

## Git-based deployment

1. Push this repository to GitHub.
2. In Vercel, open the existing `finders-book-v34` project.
3. Connect the new GitHub repository.
4. Set the production branch to `main`.
5. Keep the project root as `./`.
6. Confirm the existing Production environment variables remain present.
7. Deploy from `main`.

## Required Vercel environment variables

- `MAILERLITE_API_KEY`
- `PAYHIP_API_KEY`
- `PAYHIP_WEBHOOK_TOKEN` (or `PAYHIP_WEBHOOK_TOKENS` as a JSON array during a
  rotation — see `docs/OPERATIONS.md`)
- `GAP_CHECK_TOKEN_SECRET`

Optional, and inert until set:

- `GA4_MEASUREMENT_ID`, `GA4_API_SECRET` — server-side GA4 `purchase`/`refund`
- `CONTACT_NOTIFY_WEBHOOK_URL` — owner alert for inbound contact messages

Never commit their values. Vercel applies variable changes to new deployments, so redeploy after editing them.

## Health check

Use the private token stored in Vercel:

```text
https://www.familyfindersbook.com/api/health?t=YOUR_PRIVATE_TOKEN
```

Expected result: `ok: true`, with every required secret reported as effectively
configured, the deployed commit, `behaviour.product_map_valid: true`, and
behaviour flags including `ga4_purchase_reporting` and `contact_owner_alert`.
`GAP_CHECK_TOKEN_SECRET` is healthy only at 32+ characters. The response reports
presence/health only — never secret values, group IDs, product-map contents,
signatures, or subscriber data.

## Payhip webhook

The Payhip developer webhook endpoint is:

```text
https://www.familyfindersbook.com/api/payhip-webhook?t=YOUR_PRIVATE_TOKEN
```

The product map is:

- Essentials: `eHcPG`
- Ultimate: `Y1O7B` — capital letter O
- Family Bundle: `xPuv4`

Do not create a second Zapier, Composio, or native Payhip-to-MailerLite path for the same events. Duplicate paths can cause duplicate subscribers and emails.

The webhook owns lifecycle membership:

- paid: add `All Customers` plus the matching tier; remove `Finder's Book — Leads` and `Refunded`
- full refund: add `Refunded`; remove the refunded product tier(s), `Review Requested`, and Leads; remove `All Customers` only when no other paid tier remains; preserve unrelated valid tiers
- partial refund: no group change unless `REFUND_ON_PARTIAL=true`
- buyer declined marketing email: do not add marketing groups

## Validation before production merge

```bash
npm run validate
npm run test:render
```

After deploying a change that touches checkout, forms, the webhook, or
analytics, work through [`PRODUCTION-VERIFICATION.md`](PRODUCTION-VERIFICATION.md).

Then confirm the homepage, policy pages, lead magnet, lead form, Payhip checkout links, purchase routing, and refund routing.
