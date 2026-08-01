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

That command checks for accidentally committed secrets, broken local file references, and Payhip-to-MailerLite webhook routing behavior.

## Environment variables

Copy `.env.example` only as a reference. Store real values in Vercel, never in GitHub:

- `MAILERLITE_API_KEY`
- `PAYHIP_API_KEY`
- `PAYHIP_WEBHOOK_TOKEN`

## Deployment

Vercel should connect directly to the `main` branch. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## File organization

See [`docs/FILE-TREE.md`](docs/FILE-TREE.md) and [`docs/FILE-INVENTORY.md`](docs/FILE-INVENTORY.md).

Copyright © 2026 Joanne Godfrey and Michael David Warren Jr. All rights reserved.
