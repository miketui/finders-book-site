# Source ZIP audit

Two source archives were reviewed:

- `finders-book-v34-vercel.zip`
- `finders-book-v34.1-vercel-corrected.zip`

The v3.4.1 archive is the authoritative source. Compared with v3.4, it changed:

- `.env.example`
- `DEPLOY.md`
- `api/health.js`
- `api/payhip-webhook.js`
- `index.html`
- `test-webhook.mjs`
- Added `README-FIRST.md`

The repository package does not retain both source archives because that would duplicate the full site and complicate future merges. The corrected files are included directly in the organized tree.

Additional repository-preparation corrections:

- Removed the populated webhook token from `.env.example`
- Updated canonical, social, structured-data, sitemap, and robots URLs to the Vercel production domain
- Preserved the corrected Ultimate product key `Y1O7B`
- Moved documentation into `docs/`
- Moved tests into `tests/`
- Added secret scanning, local-reference checks, and GitHub Actions validation
