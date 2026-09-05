#!/usr/bin/env node
/**
 * check-chrome-drift.mjs
 *
 * GATE 1 decision C (hybrid chrome) trades a little markup duplication
 * for crawlable, zero-CLS navigation. This is the guard that makes that
 * trade safe: the nav and footer blocks must stay byte-identical across
 * every page, and the script fails CI the moment they do not.
 *
 * It also enforces the protected set — checkout URLs and the absence of
 * aggregateRating — because a design pass is exactly when those get
 * disturbed by accident.
 *
 * Wired into `npm run validate`.
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Every HTML page in the site root. This used to be four, which meant the
 * check printed "identical across 4 pages" while the other four quietly
 * carried three different header implementations between them — two of them
 * with no nav, no footer and no path back to checkout at all. A guard that
 * reports green on a diverged site is worse than no guard, so the list is now
 * the whole site and any new page must be added here deliberately.
 */
const PAGES = [
  "index.html", "about.html", "order.html", "contact.html", "start.html",
  "how-it-works.html", "family-emergency-planning.html", "important-documents.html",
  "letter-of-instruction.html", "in-case-of-death-binder.html",
  "privacy-policy.html", "refund-policy.html", "terms.html", "404.html",
];

/**
 * Pages permitted to ship without the header checkout button. The drawer CTA
 * inside the nav block is still required everywhere, so every page keeps a
 * purchase path; this only exempts the desktop header button. Keep this list
 * short and justified — an empty exemption list is the goal.
 */
const NO_HEADER_CTA = new Set([]);

/**
 * The canonical tier spec. index.html and order.html both sell the same three
 * SKUs and used to describe them differently — order.html silently dropped the
 * Family Coordination Guide from the $89 tier, and neither page disclosed the
 * three-household cap that the Payhip listing enforces at checkout. Each
 * fragment below must appear on both pricing pages.
 */
const TIER_PARITY = [
  { label: "Essentials · fillable + print",  needle: "49-page organizer: fillable PDF + print PDF" },
  { label: "Essentials · Start Here",        needle: "Start Here orientation page" },
  { label: "Ultimate · five tools named",    needle: "All five implementation tools: fridge card, secure vault setup, check-in plan, handoff scripts, digital legacy link + QR guide" },
  { label: "Ultimate · checksums",           needle: "File checksums so you can verify every download" },
  { label: "Family · coordination guide",    needle: "Family Coordination Guide" },
  { label: "Family · three-household cap",   needle: "Licensed for up to three households" },
  { label: "Checkout subline",               needle: "Instant download · One-time · No account required" },
];
const PRICING_PAGES = ["index.html", "order.html"];

const BLOCKS = [
  { name: "NAV",    re: /<!-- CHROME:NAV:START[\s\S]*?<!-- CHROME:NAV:END -->/ },
  { name: "FOOTER", re: /<!-- CHROME:FOOTER:START[\s\S]*?<!-- CHROME:FOOTER:END -->/ },
];

/** Checkout URLs, and how many times each must appear site-wide. */
const CHECKOUT = ["payhip.com/b/Y1O7B", "payhip.com/b/eHcPG", "payhip.com/b/xPuv4"];

const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

let failed = false;
const fail = (msg) => { console.error(`  FAIL  ${msg}`); failed = true; };
const ok   = (msg) => console.log(`  ok    ${msg}`);

console.log("\nchrome drift");

const present = PAGES.filter((p) => existsSync(p));
const missing = PAGES.filter((p) => !existsSync(p));
if (missing.length) fail(`missing page(s): ${missing.join(", ")}`);

const src = Object.fromEntries(present.map((p) => [p, readFileSync(p, "utf8")]));

/* ---- 1. nav and footer identical across every page ---- */
for (const { name, re } of BLOCKS) {
  const hashes = {};
  for (const p of present) {
    const m = src[p].match(re);
    if (!m) { fail(`${p} has no CHROME:${name} block`); continue; }
    hashes[p] = sha(m[0]);
  }
  const uniq = new Set(Object.values(hashes));
  if (uniq.size > 1) {
    fail(`CHROME:${name} differs between pages`);
    for (const [p, h] of Object.entries(hashes)) console.error(`          ${h}  ${p}`);
  } else if (uniq.size === 1) {
    ok(`CHROME:${name} identical across ${present.length} pages (${[...uniq][0]})`);
  }
}

/* ---- 2. protected set ---- */
console.log("\nprotected set");

for (const url of CHECKOUT) {
  const total = present.reduce((n, p) => n + src[p].split(url).length - 1, 0);
  if (total === 0) fail(`checkout URL missing site-wide: ${url}`);
  else ok(`${url} present (${total} references)`);
}

/* The Ultimate id is Y1O7B with a capital letter O. Y107B with a digit
   zero is a real 404 and has been mistaken for it before. */
for (const p of present) {
  if (src[p].includes("payhip.com/b/Y107B")) {
    fail(`${p} contains payhip.com/b/Y107B (digit zero) — the live id is Y1O7B (letter O)`);
  }
}

for (const p of present) {
  if (src[p].includes("aggregateRating")) {
    fail(`${p} contains aggregateRating — this product ships without review schema by design`);
  }
}
if (!failed) ok("no aggregateRating anywhere");

/* ---- 3. accessibility floor on the chrome ---- */
console.log("\nchrome a11y");
for (const p of present) {
  const s = src[p];
  if (!/class="skip"/.test(s))                 fail(`${p} lost its skip link`);
  if (!/aria-expanded="false"/.test(s))        fail(`${p} nav toggle missing aria-expanded`);
  if (!/aria-controls="sitenav"/.test(s))      fail(`${p} nav toggle missing aria-controls`);
  if (!/<nav class="nav" id="sitenav"/.test(s))fail(`${p} nav missing id=sitenav`);
}
if (!failed) ok("skip link, aria-expanded, aria-controls present on every page");

/* ---- 3b. every page keeps a path back to checkout ---- */
console.log("\nconversion path");
for (const p of present) {
  const s = src[p];
  const hasCheckout = CHECKOUT.some((u) => s.includes(u));
  const hasOrderLink = /href="\/order\.html"/.test(s);
  if (!hasCheckout && !hasOrderLink) {
    fail(`${p} has no checkout link and no /order.html link — it is a conversion dead end`);
  }
  if (!NO_HEADER_CTA.has(p) && !/class="btn btn-primary hdr-cta"/.test(s)) {
    fail(`${p} is missing the header checkout button`);
  }
  if (!/CHROME:FOOTER:START/.test(s)) fail(`${p} is missing the canonical footer`);
}
if (!failed) ok(`all ${present.length} pages reach checkout, keep the header CTA and the canonical footer`);

/* ---- 3c. tier parity between the two pricing surfaces ---- */
console.log("\ntier parity");
for (const { label, needle } of TIER_PARITY) {
  const misses = PRICING_PAGES.filter((p) => src[p] && !src[p].includes(needle));
  if (misses.length) fail(`tier copy "${label}" missing from: ${misses.join(", ")}`);
}
if (!failed) ok(`${TIER_PARITY.length} tier fragments identical on ${PRICING_PAGES.join(" + ")}`);

/* ---- 3e. Essentials fridge disclosure under the homepage comparison ---- */
console.log("\nfridge disclosure");
const FRIDGE_NOTE = "Fridge card and the other implementation tools ship with Ultimate and Family Bundle — not Essentials.";
if (!src["index.html"] || !src["index.html"].includes(FRIDGE_NOTE)) {
  fail(`index.html comparison table is missing the exact fridge disclosure`);
} else {
  ok("homepage comparison table names fridge tools as Ultimate/Bundle only");
}

/* ---- 3d. third-party scripts ---- */
console.log("\nthird-party scripts");
for (const p of present) {
  for (const m of src[p].matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"[^>]*>/g)) {
    const tag = m[0], url = m[1];
    if (/googletagmanager\.com/.test(url)) continue; // injected post-consent, measured separately
    if (!/\bdefer\b|\basync\b/.test(tag)) {
      fail(`${p} loads ${url} without defer/async — it blocks the parser on a page that takes payment`);
    }
    if (!/\bintegrity="/.test(tag)) {
      fail(`${p} loads ${url} without an integrity hash — pin it or self-host it under /assets/vendor/`);
    }
  }
}
if (!failed) ok("no unpinned or parser-blocking third-party scripts");

/* ---- 4. structured data parses ---- */
console.log("\nstructured data");
for (const p of present) {
  const blocks = [...src[p].matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  blocks.forEach((m, i) => {
    try { JSON.parse(m[1]); }
    catch (e) { fail(`${p} JSON-LD block ${i + 1} does not parse: ${e.message}`); }
  });
  if (blocks.length) ok(`${p} — ${blocks.length} JSON-LD block(s) parse`);
}

console.log("");
if (failed) { console.error("chrome drift check FAILED\n"); process.exit(1); }
console.log("chrome drift check passed\n");
