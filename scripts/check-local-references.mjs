import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('../', import.meta.url).pathname);
const htmlFiles = ['index.html', 'privacy-policy.html', 'refund-policy.html'];
const missing = [];

for (const file of htmlFiles) {
  const abs = resolve(root, file);
  const html = await readFile(abs, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    const target = ref.startsWith('/') ? resolve(root, `.${ref}`) : resolve(dirname(abs), ref);
    try {
      await access(target);
    } catch {
      missing.push(`${file} -> ${ref}`);
    }
  }
}

if (missing.length) {
  console.error('Local reference check failed:\n' + missing.map((m) => `- ${m}`).join('\n'));
  process.exit(1);
}
console.log('Local reference check passed: all referenced local files exist.');
