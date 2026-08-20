# Private EPUB source ingestion

The Finder’s Book reading-edition manuscript is paid/private source material and must never be committed to this public repository or printed into GitHub Actions logs.

## Owner-only source contract

Before the first `ebook-build`, stage the authoritative `ebook-manuscript.json` at a private HTTPS location. Prefer a short-lived signed HTTPS URL. Configure these GitHub Actions repository secrets:

- `GTM_EBOOK_SOURCE_URL` — private/signed HTTPS URL for the JSON manuscript.
- `GTM_EBOOK_SOURCE_SHA256` — exact lowercase or uppercase SHA-256 of the expected source file. The ingest process normalizes it to lowercase and requires 64 hexadecimal characters.
- `GTM_EBOOK_SOURCE_BEARER` — optional bearer token when the private endpoint requires one. A signed URL does not need this secret.

Never put the manuscript, URL, bearer token, or source hash in a PR comment, tracked `.env` file, issue, workflow input, or public artifact.

## Ingest

From GitHub Actions, manually dispatch **Finder's Book GTM Autopilot** on trusted `main` and choose `ebook-ingest`. The owner actor must be in `GTM_OWNER_ALLOWLIST`.

The hardened runtime will:

1. validate that the source is HTTPS;
2. resolve only public network addresses and connect to a prevalidated address while preserving TLS hostname verification;
3. enforce a 20 MB source ceiling;
4. verify the exact SHA-256 before accepting the file;
5. verify that the JSON has a top-level `chapters` array;
6. write only `ebook/ebook-manuscript.json` inside the private runtime; and
7. persist that manuscript only inside the encrypted GTM state snapshot.

The source content and secret values are never printed.

## Build

After a successful `ebook-ingest`, manually dispatch the workflow with `ebook-build`. The builder requires a stable `metadata.identifier`, validates chapter XHTML as XML, normalizes OPF-safe IDs, and records a real revision/build timestamp.

The finished `The_Finders_Book_Reading_Edition.epub` remains inside the encrypted GTM state snapshot. It is intentionally **not uploaded as a public-repository GitHub Actions artifact**. A later release/export path must use a genuinely private destination and remain approval-gated.
