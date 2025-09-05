import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] || 'public';

async function* walk(dir) {
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const unpkg = /<(script)([^>]*?\bsrc="(https:\/\/unpkg\.com\/[^"]+)"[^>]*)>|<(link)([^>]*?\brel="[^"]*\bstylesheet\b[^"]*"[^>]*?\bhref="(https:\/\/unpkg\.com\/[^"]+)"[^>]*)>/gim;

function hasPinnedVersion(url) {
  // Require @x.y or @x.y.z somewhere in the path
  return /@(\d+\.)?(\d+\.)?(\*|\d+)/.test(new URL(url).pathname);
}

function replaceAttr(attrs, name, value) {
  const re = new RegExp(`\\b${name}\\s*=\\s*"[^"]*"`, 'i');
  if (re.test(attrs)) return attrs.replace(re, `${name}="${value}"`);
  // insert before closing ">"
  return attrs.trim().length ? `${attrs} ${name}="${value}"` : ` ${name}="${value}"`;
}

async function hashUrl(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const h = createHash('sha384').update(buf).digest('base64');
  return `sha384-${h}`;
}

let totalPatched = 0;
let totalFiles = 0;
const warnings = new Set();

for await (const file of walk(root)) {
  if (extname(file).toLowerCase() !== '.html') continue;
  let html = await fs.readFile(file, 'utf8');
  let changed = false;

  const newHtml = await html.replaceAll(unpkg, async (...m) => {
    // m[1]/m[4] is tag name if matched, attrs in m[2]/m[5], url in m[3]/m[6]
    const isScript = !!m[1];
    const attrs = isScript ? m[2] : m[5];
    const url = isScript ? m[3] : m[6];
    if (!url) return m[0];

    if (!hasPinnedVersion(url)) {
      warnings.add(`Not version-pinned: ${url}\n  ↳ Please change to e.g. ...@1.2.3/...`);
      // Hash anyway (will lock current bytes, but may break when CDN updates)
    }

    const integrity = await hashUrl(url);

    let patched = attrs
      // drop any existing integrity/crossorigin to avoid duplicates
      .replace(/\bintegrity\s*=\s*"[^"]*"/ig, '')
      .replace(/\bcrossorigin\s*=\s*"[^"]*"/ig, '')
      .replace(/\s+/g, ' ')
      .trim();

    patched = replaceAttr(patched, 'integrity', integrity);
    patched = replaceAttr(patched, 'crossorigin', 'anonymous');

    changed = true;
    totalPatched += 1;

    if (isScript) return `<script ${patched}>`;
    return `<link ${patched}>`;
  });

  if (changed) {
    await fs.writeFile(file, newHtml, 'utf8');
    totalFiles += 1;
    console.log(`patched: ${file}`);
  }
}

console.log(`\nDone. Patched tags: ${totalPatched} across files: ${totalFiles}`);
if (warnings.size) {
  console.log('\n⚠️  Version pinning warnings:');
  for (const w of warnings) console.log(' - ' + w);
}
