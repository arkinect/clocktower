// Fails if core code names a role. Role ids belong in rules/src/roles and rules/src/jinxes only.
// 'drunk' is left out: it is also the official name of a condition, which the type system keeps apart.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'rules', 'src');
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });

const roleFiles = walk(join(root, 'roles'));
const ids = new Set(
  roleFiles.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/roleId\('([a-z_]+)'\)/g)].map((m) => m[1])),
);
// One role per file, bar the shared helpers. A file whose id this pattern misses would slip past the check below.
const helpers = new Set(['index.ts', 'lib.ts', 'words.ts']);
const expected = roleFiles.filter((f) => !helpers.has(basename(f))).length;
if (ids.size !== expected) throw new Error(`Expected ${expected} role ids, one per role file, found ${ids.size}`);
ids.delete('drunk');

const core = ['abilities', 'derive', 'model', 'night', 'phases', 'setup', 'views', 'util']
  .flatMap((d) => walk(join(root, d)))
  .concat(join(root, 'dispatch.ts'));
const hits = [];
for (const f of core) {
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(/['"`]([a-z_]+)['"`]/g)) if (ids.has(m[1])) hits.push(`${f}:${i + 1}: ${m[1]}`);
    });
}
if (hits.length) {
  console.error(`Role ids in core code:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log(`No role id in ${core.length} core files.`);
