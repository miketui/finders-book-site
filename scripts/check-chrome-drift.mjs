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

const PAGES = ["index.html", "about.html", "order.html", "contact.html"];

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
