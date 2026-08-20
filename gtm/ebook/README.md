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

The generated manuscript belongs at:

`$GTM_RUNTIME_ROOT/ebook/ebook-manuscript.json`

This file and the finished EPUB are private runtime artifacts and must not be committed to the public website repo.

## Build

```bash
uv run --project gtm/autopilot python gtm/autopilot/main.py --mode ebook-build
```

The builder writes:

`$GTM_RUNTIME_ROOT/ebook/The_Finders_Book_Reading_Edition.epub`

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

The public repository contains only this builder/specification—not the paid source, manuscript, or final buyer EPUB.
