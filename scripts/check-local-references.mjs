import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('../', import.meta.url).pathname);
const htmlFiles = [
  'index.html',
  'about.html',
  'order.html',
  'contact.html',
  'privacy-policy.html',
  'refund-policy.html',
  'terms.html',
  '404.html',
];
const missing = [];
const publicHost = 'https://www.familyfindersbook.com';
const retiredHost = 'https://finders-book-v34.vercel.app';

for (const file of htmlFiles) {
  const abs = resolve(root, file);
  const html = await readFile(abs, 'utf8');

  if (html.includes(retiredHost)) {
    missing.push(`${file} -> retired production host remains in public metadata`);
  }

  if (file !== '404.html' && !html.includes(`<link rel="canonical" href="${publicHost}${file === 'index.html' ? '/' : `/${file}`}">`)) {
    missing.push(`${file} -> missing canonical URL for ${publicHost}`);
  }

  if (file === 'index.html') {
    const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]));
    const anchors = [...html.matchAll(/href=["']#([^"']+)["']/g)].map((m) => m[1]);
    for (const anchor of anchors) {
      if (!ids.has(anchor)) missing.push(`${file} -> missing #${anchor} target`);
    }
  }

  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    // Skip Vercel-provided resources that only exist after deployment
    if (ref.startsWith('/_vercel/')) continue;
    const target = ref.startsWith('/') ? resolve(root, `.${ref}`) : resolve(dirname(abs), ref);
    try {
      await access(target);
    } catch {
      missing.push(`${file} -> ${ref}`);
    }
  }
}

for (const file of ['robots.txt', 'sitemap.xml']) {
  const contents = await readFile(resolve(root, file), 'utf8');
  if (contents.includes(retiredHost)) missing.push(`${file} -> retired production host remains`);
  if (!contents.includes(publicHost)) missing.push(`${file} -> custom production host is missing`);
}

if (missing.length) {
  console.error('Local reference check failed:\n' + missing.map((m) => `- ${m}`).join('\n'));
  process.exit(1);
}
console.log('Local reference check passed: all referenced local files exist.');
