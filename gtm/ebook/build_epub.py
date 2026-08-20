from __future__ import annotations

import argparse
import html
import json
import re
import uuid
import zipfile
from pathlib import Path


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def safe_id(value: str, fallback: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")
    return cleaned or fallback


def strip_unsafe_markup(value: str) -> str:
    value = re.sub(r"<script\b[^>]*>.*?</script>", "", value, flags=re.I | re.S)
    value = re.sub(r"\son[a-z]+\s*=\s*(['\"]).*?\1", "", value, flags=re.I | re.S)
    return value


def chapter_xhtml(title: str, body: str, language: str) -> str:
    body = strip_unsafe_markup(body)
    return f'''<?xml version="1.0" encoding="utf-8"?>
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


def build_epub(source: Path, output: Path) -> None:
    data = json.loads(source.read_text())
    metadata = data.get("metadata", {})
    title = metadata.get("title", "The Finder's Book — Reading Edition")
    creator = metadata.get("creator", "Joanne Godfrey and Michael David")
    language = metadata.get("language", "en-US")
    identifier = metadata.get("identifier") or f"urn:uuid:{uuid.uuid4()}"
    description = metadata.get(
        "description",
        "A non-fillable reading edition of The Finder's Book, redesigned for reflowable ebook reading.",
    )
    chapters = data.get("chapters", [])
    if not chapters:
        raise SystemExit("Manuscript must contain at least one chapter.")

    normalized = []
    seen = set()
    for index, chapter in enumerate(chapters, start=1):
        chapter_title = str(chapter.get("title", f"Chapter {index}"))
        chapter_id = safe_id(str(chapter.get("id", "")), f"chapter-{index:02d}")
        while chapter_id in seen:
            chapter_id = f"{chapter_id}-{index}"
        seen.add(chapter_id)
        body = str(chapter.get("body_xhtml", "")).strip()
        if not body:
            paragraphs = chapter.get("paragraphs", [])
            body = "\n".join(f"<p>{esc(str(p))}</p>" for p in paragraphs)
        normalized.append((chapter_id, chapter_title, body))

    nav_items = "\n".join(
        f'      <li><a href="{cid}.xhtml">{esc(ctitle)}</a></li>'
        for cid, ctitle, _ in normalized
    )
    nav = f'''<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
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
    <meta property="dcterms:modified">2026-08-20T00:00:00Z</meta>
  </metadata>
  <manifest>
    {''.join(manifest_items)}
  </manifest>
  <spine>
    {''.join(spine_items)}
  </spine>
</package>
'''

    container = '''<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
'''
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
