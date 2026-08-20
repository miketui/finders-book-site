import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('../', import.meta.url);
const ignoredDirs = new Set(['.git', '.vercel', '.venv', 'node_modules']);
const binaryExts = new Set(['.pdf', '.webp', '.jpg', '.jpeg', '.png', '.woff2', '.zip']);
const findings = [];

async function walk(dirUrl) {
  for (const entry of await readdir(dirUrl, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) continue;
    const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dirUrl);
    if (entry.isDirectory()) {
      await walk(url);
      continue;
    }
    // Dependency environments can contain directory symlinks and other
    // non-regular entries. They are not repository source and attempting to
    // read them as UTF-8 can fail with EISDIR before the real scan begins.
    if (!entry.isFile()) continue;
    if (binaryExts.has(extname(entry.name).toLowerCase())) continue;
    const path = relative(root.pathname, url.pathname);
    if (path === 'scripts/check-secrets.mjs') continue;
    const text = await readFile(url, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const assignment = line.match(/^\s*([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (assignment && assignment[2] && !assignment[2].startsWith('#')) {
        findings.push(`${path}:${index + 1}: populated sensitive variable ${assignment[1]}`);
      }
      if (/\b(?:sk_live_|sk_test_|pk_live_|ml_[A-Za-z0-9_-]{20,}|ph_[A-Za-z0-9_-]{20,})/.test(line)) {
        findings.push(`${path}:${index + 1}: possible credential pattern`);
      }
    });
  }
}

await walk(root);
if (findings.length) {
  console.error('Secret scan failed:\n' + findings.map((f) => `- ${f}`).join('\n'));
  process.exit(1);
}
console.log('Secret scan passed: no populated secret variables or known credential patterns found.');
