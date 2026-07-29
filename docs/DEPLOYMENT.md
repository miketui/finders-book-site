# Deployment runbook

## Current production target

- Vercel project: `finders-book-v34`
- Vercel team: `mikes-projects-1e9a868e`
- Production URL: `https://finders-book-v34.vercel.app`

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

Never commit their values. Vercel applies variable changes to new deployments, so redeploy after editing them.

## Health check

Use the private token stored in Vercel:

```text
https://finders-book-v34.vercel.app/api/health?t=YOUR_PRIVATE_TOKEN
```

Expected result: `ok: true`, with all three secrets reported as present.

## Payhip webhook

The Payhip developer webhook endpoint is:

```text
https://finders-book-v34.vercel.app/api/payhip-webhook?t=YOUR_PRIVATE_TOKEN
```

The product map is:

- Essentials: `eHcPG`
- Ultimate: `Y1O7B` — capital letter O
- Family Bundle: `xPuv4`

Do not create a second Zapier, Composio, or native Payhip-to-MailerLite path for the same events. Duplicate paths can cause duplicate subscribers and emails.

## Validation before production merge

```bash
npm run validate
```

Then confirm the homepage, policy pages, lead magnet, lead form, Payhip checkout links, purchase routing, and refund routing.
