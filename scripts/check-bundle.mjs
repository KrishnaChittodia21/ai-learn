// Bundle-size check (M9), run after `vite build`: gzips every emitted JS/CSS chunk and fails if the entry or any
// route chunk is more than 30 KB (gzip) over its budget in scripts/bundle-budget.json, or a new chunk is over 30 KB.
//   node scripts/check-bundle.mjs            check dist/ against the budget
//   node scripts/check-bundle.mjs --write    record the current sizes as the new budget (after a reviewed change)
//   node scripts/check-bundle.mjs --dir=path check another build folder (used to measure an older dist)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const SLACK = 30 * 1024;
const root = new URL('..', import.meta.url).pathname;
const dirArg = process.argv.find((a) => a.startsWith('--dir='));
const assets = join(dirArg ? dirArg.slice(6) : join(root, 'dist'), 'assets');
const budgetFile = join(root, 'scripts/bundle-budget.json');

/** "Shorts-BAS93W27.js" → "Shorts.js" (the hash changes every build; the name is the chunk's identity) */
const nameOf = (file) => file.replace(/-[\w-]{8}(\.\w+)$/, '$1');

const sizes = {};
for (const file of readdirSync(assets).filter((f) => /\.(js|css)$/.test(f)).sort()) {
  const name = nameOf(file);
  sizes[name] = (sizes[name] ?? 0) + gzipSync(readFileSync(join(assets, file)), { level: 9 }).length;
}

if (process.argv.includes('--write')) {
  writeFileSync(budgetFile, `${JSON.stringify(sizes, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(sizes).length} chunk budgets to scripts/bundle-budget.json`);
  process.exit(0);
}

const budget = JSON.parse(readFileSync(budgetFile, 'utf8'));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
let failed = 0;
for (const [name, size] of Object.entries(sizes)) {
  const base = budget[name];
  const delta = size - (base ?? 0);
  const over = delta > SLACK;
  if (over) failed++;
  if (over || base === undefined || Math.abs(delta) >= 512)
    console.log(`${over ? 'FAIL' : 'ok  '} ${name.padEnd(36)} ${kb(size).padStart(10)}  ${base === undefined ? '(new)' : `${delta >= 0 ? '+' : ''}${kb(delta)}`}`);
}
if (failed) {
  console.error(`\n${failed} chunk(s) grew by more than ${kb(SLACK)} gzip. Shrink them, or review and run: node scripts/check-bundle.mjs --write`);
  process.exit(1);
}
console.log(`Bundle check passed: ${Object.keys(sizes).length} chunks within ${kb(SLACK)} gzip of their budget.`);
