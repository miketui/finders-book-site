from __future__ import annotations

import argparse
import html
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path


RESERVED_PACKAGE_IDS = {"book-id", "nav", "css", "toc"}
RESERVED_OUTPUT_BASENAMES = {"nav", "styles", "content", "container", "mimetype"}


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def safe_id(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_.-]+", "-", value).strip("-")
    cleaned = cleaned or fallback
    if not re.match(r"^[A-Za-z_]", cleaned):
        cleaned = f"id-{cleaned}"
    return cleaned


def strip_unsafe_markup(value: str) -> str:
    value = re.sub(r"<script\b[^>]*>.*?</script>", "", value, flags=re.I | re.S)
    value = re.sub(r"\son[a-z]+\s*=\s*(['\"]).*?\1", "", value, flags=re.I | re.S)
    return value


def validate_body_xhtml(body: str, chapter_title: str) -> str:
    body = strip_unsafe_markup(body)
    wrapped = f'<div xmlns="http://www.w3.org/1999/xhtml">{body}</div>'
    try:
        ET.fromstring(wrapped)
    except ET.ParseError as exc:
        raise SystemExit(
            f"Chapter {chapter_title!r} contains malformed XHTML: {exc}. "
            "Use XML-safe markup (for example &amp; instead of a bare &, close all tags, "
            "and avoid HTML-only named entities)."
        ) from exc
    return body


def validate_complete_xhtml(document: str, label: str) -> None:
    try:
        ET.fromstring(document)
    except ET.ParseError as exc:
        raise SystemExit(f"Generated {label} is not well-formed XHTML/XML: {exc}") from exc


def chapter_xhtml(title: str, body: str, language: str) -> str:
    body = validate_body_xhtml(body, title)
    document = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{esc(language)}" lang="{esc(language)}">
<head>
  <meta charset="utf-8" />
  <title>{esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css" />
</head>
<body>
  <main>
    <h1>{esc(title)}</h1>
    {body}
  </main>
</body>
</html>
'''
    validate_complete_xhtml(document, f"chapter {title!r}")
    return document


def stable_identifier(metadata: dict) -> str:
    identifier = str(metadata.get("identifier", "")).strip()
    if not identifier:
        raise SystemExit(
            "metadata.identifier is required and must remain stable across rebuilds. "
            "EBOOK_PRODUCTION must set it once in the private manuscript before the first build."
        )
    if identifier.upper().startswith("REQUIRED-") or "<" in identifier or ">" in identifier:
        raise SystemExit("metadata.identifier is still a placeholder; set a stable publication identifier.")
    return identifier


def modified_timestamp(metadata: dict) -> str:
    raw = str(
        metadata.get("modified")
        or metadata.get("revision_timestamp")
        or ""
    ).strip()
    if not raw:
        return (
            datetime.now(timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise SystemExit(
            "metadata.modified/revision_timestamp must be ISO-8601."
        ) from exc
    if parsed.tzinfo is None:
        raise SystemExit(
            "metadata.modified/revision_timestamp must include a timezone."
        )
    return (
        parsed.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def build_epub(source: Path, output: Path) -> None:
    data = json.loads(source.read_text())
    metadata = data.get("metadata", {})
    title = metadata.get("title", "The Finder's Book — Reading Edition")
    creator = metadata.get("creator", "Joanne Godfrey and Michael David")
    language = metadata.get("language", "en-US")
    identifier = stable_identifier(metadata)
    modified = modified_timestamp(metadata)
    description = metadata.get(
        "description",
        "A non-fillable reading edition of The Finder's Book, redesigned for reflowable ebook reading.",
    )
    chapters = data.get("chapters", [])
    if not chapters:
        raise SystemExit("Manuscript must contain at least one chapter.")

    normalized = []
    seen = {
        *(item.lower() for item in RESERVED_PACKAGE_IDS),
        *(item.lower() for item in RESERVED_OUTPUT_BASENAMES),
    }
    for index, chapter in enumerate(chapters, start=1):
        chapter_title = str(chapter.get("title", f"Chapter {index}"))
        base_id = safe_id(
            str(chapter.get("id", "")),
            f"chapter-{index:02d}",
        )
        chapter_id = base_id
        suffix = 1
        while chapter_id.lower() in seen:
            chapter_id = safe_id(
                f"{base_id}-chapter-{index:02d}-{suffix}",
                f"chapter-{index:02d}-{suffix}",
            )
            suffix += 1
        seen.add(chapter_id.lower())
        body = str(chapter.get("body_xhtml", "")).strip()
        if not body:
            paragraphs = chapter.get("paragraphs", [])
            body = "\n".join(f"<p>{esc(str(p))}</p>" for p in paragraphs)
        body = validate_body_xhtml(body, chapter_title)
        normalized.append((chapter_id, chapter_title, body))

    nav_items = "\n".join(
        f'      <li><a href="{cid}.xhtml">{esc(ctitle)}</a></li>'
        for cid, ctitle, _ in normalized
    )
    nav = f'''<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="{esc(language)}" lang="{esc(language)}">
<head><meta charset="utf-8" /><title>Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
{nav_items}
    </ol>
  </nav>
</body>
</html>
'''
    validate_complete_xhtml(nav, "navigation document")

    manifest_items = [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
        '<item id="css" href="styles.css" media-type="text/css"/>',
    ]
    spine_items = []
    for cid, _, _ in normalized:
        manifest_items.append(
            f'<item id="{esc(cid)}" href="{esc(cid)}.xhtml" media-type="application/xhtml+xml"/>'
        )
        spine_items.append(f'<itemref idref="{esc(cid)}"/>')

    opf = f'''<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="{esc(language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">{esc(identifier)}</dc:identifier>
    <dc:title>{esc(title)}</dc:title>
    <dc:creator>{esc(creator)}</dc:creator>
    <dc:language>{esc(language)}</dc:language>
    <dc:description>{esc(description)}</dc:description>
    <meta property="dcterms:modified">{esc(modified)}</meta>
  </metadata>
  <manifest>
    {''.join(manifest_items)}
  </manifest>
  <spine>
    {''.join(spine_items)}
  </spine>
</package>
'''
    validate_complete_xhtml(opf, "package document")

    container = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
'''
    validate_complete_xhtml(container, "container document")

    css = '''body { font-family: serif; line-height: 1.5; margin: 5%; }
h1 { font-size: 1.8em; line-height: 1.15; }
h2 { font-size: 1.35em; }
blockquote { margin: 1em 1.5em; }
ul, ol { padding-left: 1.4em; }
'''

    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        zf.writestr("META-INF/container.xml", container, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("OEBPS/content.opf", opf, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("OEBPS/nav.xhtml", nav, compress_type=zipfile.ZIP_DEFLATED)
        zf.writestr("OEBPS/styles.css", css, compress_type=zipfile.ZIP_DEFLATED)
        for cid, ctitle, body in normalized:
            zf.writestr(
                f"OEBPS/{cid}.xhtml",
                chapter_xhtml(ctitle, body, language),
                compress_type=zipfile.ZIP_DEFLATED,
            )

    print(output)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    build_epub(Path(args.input), Path(args.output))


if __name__ == "__main__":
    main()
