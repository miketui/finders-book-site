# The Finder's Book website

Production website and serverless integration layer for **The Finder's Book — The Family Clarity System™**.

## Production

- Website: `https://www.familyfindersbook.com`
- Checkout: Payhip
- Marketing email and automations: MailerLite
- Hosting and serverless functions: Vercel

## Repository scope

This repository contains the complete public website, public preview assets, the free Family Readiness Gap Check lead magnet, and the Vercel API routes used for MailerLite signup and Payhip webhook processing.

It intentionally does **not** contain paid customer deliverables distributed through Payhip, including the paid fillable/print books and full bonus PDFs. Only public preview images of those products are stored here.

## Local verification

```bash
npm run validate
```

That command checks for accidentally committed secrets, broken local file references, shared navigation drift, CSP/analytics compatibility, and the Payhip, contact, and lead-magnet serverless flows.

Rendered-page validation is a separate browser job. It renders every page in
Chromium and asserts that above-the-fold content is actually visible, that the
Skip Intro control receives its own clicks at desktop and mobile widths, that
consent gates analytics, and that page weight stays inside budget:

```bash
npm run test:render
```

The sitemap is generated, not hand-edited. `npm run validate` fails if it has
drifted from the pages in the repository:

```bash
npm run sitemap        # rewrite sitemap.xml from canonical pages + git history
npm run check:sitemap  # fail if it is stale (also part of npm run validate)
```

## Environment variables

Copy `.env.example` only as a reference. Store real values in Vercel, never in GitHub:

Required:

- `MAILERLITE_API_KEY`
- `PAYHIP_API_KEY`
- `PAYHIP_WEBHOOK_TOKEN`
- `GAP_CHECK_TOKEN_SECRET`

Optional, and off until set:

- `GA4_MEASUREMENT_ID` + `GA4_API_SECRET` — server-side GA4 `purchase` and
  `refund` reporting from the Payhip webhook. The browser hands the visitor to
  Payhip and never learns whether the order completed, so revenue can only be
  reported from the server.
- `CONTACT_NOTIFY_WEBHOOK_URL` — alerts the owner when a contact message
  arrives, instead of relying on someone opening MailerLite.

## Deployment

Vercel should connect directly to the `main` branch. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Operating the site

- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — alerts, expected 4xx noise,
  rollback, token rotation.
- [`docs/PRODUCTION-VERIFICATION.md`](docs/PRODUCTION-VERIFICATION.md) — the
  controlled manual pass after a release that touches money or forms.
- [`docs/OWNER-ACTIONS.md`](docs/OWNER-ACTIONS.md) — what only an account owner
  can close, with the live state verified on 2026-08-17.

## File organization

See [`docs/FILE-TREE.md`](docs/FILE-TREE.md) and [`docs/FILE-INVENTORY.md`](docs/FILE-INVENTORY.md).

Copyright © 2026 Joanne Godfrey and Michael David Warren Jr. All rights reserved.
