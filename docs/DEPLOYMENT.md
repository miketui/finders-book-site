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
- `PAYHIP_WEBHOOK_TOKEN`
- `GAP_CHECK_TOKEN_SECRET`

Never commit their values. Vercel applies variable changes to new deployments, so redeploy after editing them.

## Health check

Use the private token stored in Vercel:

```text
https://www.familyfindersbook.com/api/health?t=YOUR_PRIVATE_TOKEN
```

Expected result: `ok: true`, with all four secrets reported as present. The
endpoint also reports non-secret group IDs and a short fingerprint, never the
secret values themselves.

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
- full refund: add `Refunded`; remove `All Customers`, every tier, `Review Requested`, and Leads
- partial refund: no group change unless `REFUND_ON_PARTIAL=true`
- buyer declined marketing email: do not add marketing groups

## Validation before production merge

```bash
npm run validate
npm run test:render
```

Then confirm the homepage, policy pages, lead magnet, lead form, Payhip checkout links, purchase routing, and refund routing.
