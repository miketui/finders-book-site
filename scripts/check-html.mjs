#!/usr/bin/env node
/** Lightweight semantic, SEO, and accessibility guard for every HTML file. */
import { readFileSync } from 'node:fs';

const PAGES = [
  'index.html', 'about.html', 'order.html', 'contact.html',
  'how-it-works.html', 'family-emergency-planning.html', 'important-documents.html',
  'privacy-policy.html', 'refund-policy.html', 'terms.html', '404.html',
];

/** Search-result truncation limits. Not laws, but past these a snippet is being cut. */
const TITLE_MAX = 65;
const DESCRIPTION_MAX = 160;

let failed = false;
const fail = (message) => { failed = true; console.error(`  FAIL  ${message}`); };
const ok = (message) => console.log(`  ok    ${message}`);

/** Titles and descriptions are authored with entities; measure what Google shows. */
const decode = (text) => String(text)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

console.log('\nHTML quality');

const titles = new Map();
for (const page of PAGES) {
  const html = readFileSync(page, 'utf8');
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const descriptions = [...html.matchAll(/<meta\s+name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/gi)];
  const h1s = [...html.matchAll(/<h1\b/gi)];
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);

  if (!/<html\s+[^>]*lang=["']en["']/i.test(html)) fail(`${page} is missing lang="en"`);
  if (!title) fail(`${page} is missing a title`);
  else if (titles.has(title)) fail(`${page} duplicates the title from ${titles.get(title)}`);
  else titles.set(title, page);
  if (descriptions.length !== 1) fail(`${page} must have exactly one meta description`);
  if (h1s.length !== 1) fail(`${page} must have exactly one h1 (found ${h1s.length})`);
  if (!/<main\b[^>]*id=["']main["']/i.test(html)) fail(`${page} is missing main#main`);
  if (!/class=["'][^"']*\bskip\b[^"']*["'][^>]*href=["']#main["']/i.test(html)) fail(`${page} is missing a skip link to main`);
  if (duplicateIds.length) fail(`${page} has duplicate id(s): ${duplicateIds.join(', ')}`);
  images.forEach((tag, index) => {
    if (!/\balt=["'][^"']*["']/i.test(tag)) fail(`${page} image ${index + 1} is missing alt`);
  });
  if (title && decode(title).length > TITLE_MAX) {
    fail(`${page} title is ${decode(title).length} characters and will truncate in search results`);
  }
  if (descriptions.length === 1 && decode(descriptions[0][1]).length > DESCRIPTION_MAX) {
    fail(`${page} meta description is ${decode(descriptions[0][1]).length} characters and will truncate`);
  }

  // Structured data is invisible until it is wrong. A block that no longer
  // parses stops every rich result on the page with no other symptom.
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  blocks.forEach(([, raw], index) => {
    try {
      const data = JSON.parse(raw);
      const nodes = Array.isArray(data) ? data : (data['@graph'] ?? [data]);
      if (!data['@context']) fail(`${page} JSON-LD block ${index + 1} is missing @context`);
      for (const node of [].concat(nodes)) {
        if (node && typeof node === 'object' && !node['@type']) {
          fail(`${page} JSON-LD block ${index + 1} contains a node with no @type`);
        }
      }
    } catch (error) {
      fail(`${page} JSON-LD block ${index + 1} does not parse: ${error.message}`);
    }
  });

  if (/href=["']\s*(?:#\s*["']|javascript:)/i.test(html)) fail(`${page} contains a placeholder or javascript link`);
  if (/payhip\.com\/b\/Y107B/.test(html)) fail(`${page} contains the digit-zero Ultimate product key`);
  if (!failed) ok(`${page} semantic floor passed`);
}

if (failed) {
  console.error('\nHTML quality check FAILED\n');
  process.exit(1);
}
console.log('\nHTML quality check passed\n');
