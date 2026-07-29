# Security policy

## Secrets

Never commit API keys, webhook tokens, passwords, or production `.env` files. Real values belong in Vercel Environment Variables.

Before every pull request or production merge, run:

```bash
npm run check:secrets
```

## Sensitive customer data

This repository must not contain customer exports, purchase records, subscriber lists, completed Finder's Book forms, or support messages containing personal information.

## Paid files

Full paid product files remain private in Payhip and are excluded from this repository.
