# Finder's Book — EPUB Reading Edition Workstream

This workstream creates a **separate non-fillable reading edition** for Kindle / Apple Books / Kobo-style ebook distribution. It must never upload or mechanically convert the current fillable/printable Finder's Book PDF unchanged.

## Product distinction

- Current digital product: fillable AcroForm PDF + clean printable PDF. It is a working organizer.
- Future ebook product: reflowable EPUB 3 reading edition. It is a guided reading/education product with checklists, reflective prompts and safe handoff guidance.
- The ebook may reference the working PDF as a separate product/companion where appropriate, but it does not recreate interactive form controls.

## Agent

`EBOOK_PRODUCTION` owns authoritative-source intake, source-page → ebook-chapter mapping, prose/checklist/prompt conversion, EPUB metadata, semantic/reflowable structure, accessibility, manuscript generation, build and validation handoff.

The agent must mark the build BLOCKED if the full authoritative paid source is not securely available. It may not reconstruct missing paid content from marketing previews.

## Private runtime input

The manuscript belongs only at:

`$GTM_RUNTIME_ROOT/ebook/ebook-manuscript.json`

The authoritative source must enter through the owner-authenticated GitHub Actions `ebook-ingest` mode described in `PRIVATE-INGESTION.md`. Do **not** run `gtm/autopilot/main.py` directly to create or build the paid edition, because the authenticated workflow establishes the private runtime, restores encrypted state, and enforces the owner gate.

## Build

After a successful private ingest, open the **Finder's Book GTM Autopilot** workflow in GitHub Actions, choose **Run workflow**, and select `ebook-build`. The trusted-main workflow invokes the hardened control plane and writes:

`$GTM_RUNTIME_ROOT/ebook/The_Finders_Book_Reading_Edition.epub`

The finished EPUB is persisted only inside encrypted GTM state. It is not uploaded as a public-repository Actions artifact.

## Release gate

Before any retailer upload:

- full source mapping complete;
- no AcroForm/form-field dependency remains;
- pointer-not-vault safety doctrine preserved;
- navigation and semantic headings checked;
- accessibility/alt text reviewed;
- EPUBCheck 5.x passes;
- Apple Books / Kindle Previewer / Kobo-compatible reading QA is completed where applicable;
- title/subtitle/description/keywords are approved as a distinct edition;
- upload/publishing is explicitly approved by the owner.

The public repository contains only builder/specification code and private-ingestion instructions—not the paid source, manuscript, or final buyer EPUB.
