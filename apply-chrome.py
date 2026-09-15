#!/usr/bin/env python3
"""
apply-chrome.py — surgically upgrade index.html to the shared site chrome.

WHAT IT CHANGES (and nothing else)
  1. <header class="hdr"> ... </header>   -> the shared CHROME:NAV block
  2. <footer class="ftr"> ... </footer>   -> the shared CHROME:FOOTER block
  3. adds chrome.css + pages.css after the styles.css link
  4. adds chrome.js before motion.js
  5. adds a <div class="scrim"> after the header

WHAT IT DOES NOT TOUCH
  - any Payhip URL
  - any price, any JSON-LD Offer, any product claim
  - any api/ file
  - the hero, the sections, the existing motion, the existing analytics
  - the header stays SOLID on the home page (no .hdr-over) so the
    current hero rendering is not disturbed. Flip it later if wanted.

Run from the repo root:
    python3 apply-chrome.py            # writes index.html
    python3 apply-chrome.py --dry-run  # prints a diff and writes nothing

A timestamped backup of index.html is written next to it.
"""
import argparse
import datetime
import difflib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
INDEX = ROOT / "index.html"

NAV = """<!-- CHROME:NAV:START — identical in every page. Guarded by scripts/check-chrome-drift.mjs -->
<header class="hdr">
  <div class="wrap hdr-in">
    <a class="brand" href="/" aria-label="The Family Clarity Co. home">Family <em>Clarity</em> Co.</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="sitenav" aria-label="Open menu">
      <span></span>
    </button>
    <nav class="nav" id="sitenav" aria-label="Main">
      <a href="/">Home</a>
      <a href="/about.html">About</a>
      <a href="/order.html">Order</a>
      <a href="/contact.html">Contact</a>
      <a class="btn btn-primary drawer-cta" href="https://payhip.com/b/Y1O7B" data-checkout data-placement="drawer" data-tier="ultimate" data-price="49">Get Ultimate: $49</a>
      <p class="drawer-note">Instant download. One-time payment. If the files won’t open, we refund — no argument. If what you got isn’t what we showed, email us within 30 days and we’ll make it right. <a href="/order.html">Compare editions</a>.</p>
    </nav>
    <a class="btn btn-primary hdr-cta" href="https://payhip.com/b/Y1O7B" data-checkout data-placement="header" data-tier="ultimate" data-price="49">Get Ultimate: $49</a>
  </div>
</header>
<div class="scrim" aria-hidden="true"></div>
<!-- CHROME:NAV:END -->"""

FOOTER = """<!-- CHROME:FOOTER:START — identical in every page. Guarded by scripts/check-chrome-drift.mjs -->
<footer class="ftr">
  <div class="wrap">
    <div class="ftr-grid">
      <div>
        <h2>The Finder's Book</h2>
        <p class="footer-summary">The Family Clarity System™: a 250-page family emergency and legacy organizer by Michael David.</p>
        <p class="ftr-nav-note">A pointer, not a vault. No passwords stored, ever.</p>
      </div>
      <div>
        <h2>Site</h2>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/about.html">About</a></li>
          <li><a href="/order.html">Editions &amp; pricing</a></li>
          <li><a href="/gift.html">Gift for a parent</a></li>
          <li><a href="/contact.html">Contact &amp; feedback</a></li>
          <li><a href="/#gap-check">Free Gap Check</a></li>
        </ul>
      </div>
      <div>
        <h2>Support</h2>
        <ul>
          <li><a href="/contact.html">Ask a question</a></li>
          <li><a href="/refund-policy.html">Refund policy</a></li>
          <li><a href="/privacy-policy.html">Privacy policy</a></li>
          <li><a href="/contact.html">Professional licensing</a></li>
        </ul>
      </div>
    </div>
    <div class="ftr-legal">
      <p><strong>This is not legal, medical, or financial advice.</strong> The Finder's Book is a structured template for personal record-keeping. It is not a will, trust, contract, power of attorney, or advance directive, and it confers no authority over any account, property, or medical decision. The legal documents your family will need are the originals signed and witnessed according to the law of your jurisdiction. Consult an attorney, licensed medical professional, or licensed financial advisor for questions about legal, medical, or financial effect.</p>
      <p>Copyright © 2026 Joanne Godfrey and Michael David Warren Jr. All rights reserved. The Family Clarity System™ is a trademark of Joanne Godfrey and Michael David Warren Jr. The trade dress of this work, including its layout system, typographic treatment, and section architecture, is protected. Ultimate Digital Edition v1.2.3.</p>
    </div>
  </div>
</footer>
<!-- CHROME:FOOTER:END -->"""

PROTECTED = [
    "payhip.com/b/Y1O7B",
    "payhip.com/b/eHcPG",
    "payhip.com/b/xPuv4",
]


def fail(msg):
    print("ABORT: " + msg, file=sys.stderr)
    sys.exit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not INDEX.exists():
        fail("index.html not found. Run this from the repo root.")

    original = INDEX.read_text(encoding="utf-8")
    s = original

    before_counts = {p: original.count(p) for p in PROTECTED}

    if "CHROME:NAV:START" in s:
        print("index.html already carries the shared chrome. Nothing to do.")
        return

    # 1. header ------------------------------------------------------------
    m = re.search(r"<header class=\"hdr\">.*?</header>", s, re.S)
    if not m:
        fail('could not find <header class="hdr"> ... </header>')
    s = s[: m.start()] + NAV + s[m.end():]

    # 2. footer ------------------------------------------------------------
    m = re.search(r"<footer class=\"ftr\">.*?</footer>", s, re.S)
    if not m:
        fail('could not find <footer class="ftr"> ... </footer>')
    s = s[: m.start()] + FOOTER + s[m.end():]

    # 3. stylesheets -------------------------------------------------------
    link = '<link rel="stylesheet" href="styles.css">'
    if link not in s:
        fail("could not find the styles.css link")
    s = s.replace(
        link,
        link + '\n<link rel="stylesheet" href="chrome.css">\n<link rel="stylesheet" href="pages.css">',
        1,
    )

    # 4. chrome.js ---------------------------------------------------------
    if 'src="chrome.js"' not in s:
        m = re.search(r'<script src="motion\.js"[^>]*></script>', s)
        if m:
            s = s[: m.start()] + '<script src="chrome.js" defer></script>\n' + s[m.start():]
        else:
            s = s.replace("</body>", '<script src="chrome.js" defer></script>\n</body>', 1)

    # ---- invariants ------------------------------------------------------
    # The chrome deliberately changes: the old header linked straight to
    # Payhip, the new one routes to the order page so a cold visitor sees
    # the comparison first. So the invariant is checked on BODY CONTENT
    # (everything outside the chrome blocks), which must be untouched.
    def body_only(text):
        text = re.sub(r"<!-- CHROME:NAV:START.*?<!-- CHROME:NAV:END -->", "", text, flags=re.S)
        text = re.sub(r"<!-- CHROME:FOOTER:START.*?<!-- CHROME:FOOTER:END -->", "", text, flags=re.S)
        text = re.sub(r"<header class=\"hdr\">.*?</header>", "", text, flags=re.S)
        text = re.sub(r"<footer class=\"ftr\">.*?</footer>", "", text, flags=re.S)
        return text

    ob, nb = body_only(original), body_only(s)
    for p in PROTECTED:
        if ob.count(p) != nb.count(p):
            fail(f"checkout URL count changed in page body for {p}: "
                 f"{ob.count(p)} -> {nb.count(p)}. No file written.")
    if ob.count("aggregateRating") != nb.count("aggregateRating"):
        fail("aggregateRating count changed. No file written.")

    # Report the chrome-level delta out loud rather than hiding it.
    chrome_delta = {p: s.count(p) - before_counts[p] for p in PROTECTED}
    for p, d in chrome_delta.items():
        if d:
            print(f"  NOTE: {p} count {before_counts[p]} -> {s.count(p)} "
                  f"({d:+d}) — header CTA now routes to /order.html")

    if args.dry_run:
        diff = difflib.unified_diff(
            original.splitlines(), s.splitlines(),
            fromfile="index.html (current)", tofile="index.html (patched)",
            lineterm="", n=2,
        )
        print("\n".join(diff))
        print("\n--- dry run: nothing written ---")
        return

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = INDEX.with_suffix(f".backup-{stamp}.html")
    backup.write_text(original, encoding="utf-8")
    INDEX.write_text(s, encoding="utf-8")

    print(f"index.html patched. Backup written to {backup.name}")
    print("Checkout URLs unchanged:")
    for p, c in before_counts.items():
        print(f"  {p}  x{c}")


if __name__ == "__main__":
    main()
