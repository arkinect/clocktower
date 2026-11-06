// Proves the boundary checks fail on bad code: writes each deliberately bad file, expects the check to reject it,
// and removes the file again. Run in CI, so a check that silently stops working fails the build.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd) => spawnSync(cmd, { cwd: root, shell: true, encoding: 'utf8' });

const cruise = 'npm run --silent boundaries';
const cases = [
  { name: 'web importing rules', file: 'packages/web/src/__bad.ts', body: "import '@ct/rules';\n", check: cruise },
  {
    name: 'web importing server',
    file: 'packages/web/src/__bad.ts',
    body: "import '../../server/src/main';\n",
    check: cruise,
  },
  {
    name: 'rules importing a Node built-in',
    file: 'packages/rules/src/__bad.ts',
    body: "import 'node:fs';\n",
    check: cruise,
  },
  {
    name: 'a RoleId constructor call in rules/src/night',
    file: 'packages/rules/src/night/__bad.ts',
    body: "import { roleId } from '@ct/protocol';\nexport const x = roleId('empath');\n",
    check: 'npx eslint packages/rules/src/night/__bad.ts',
  },
  {
    name: 'Date.now in rules',
    file: 'packages/rules/src/__bad.ts',
    body: 'export const x = Date.now();\n',
    check: 'npx eslint packages/rules/src/__bad.ts',
  },
  {
    name: 'Math.random in rules',
    file: 'packages/rules/src/__bad.ts',
    body: 'export const x = Math.random();\n',
    check: 'npx eslint packages/rules/src/__bad.ts',
  },
  {
    name: 'crypto in rules',
    file: 'packages/rules/src/__bad.ts',
    body: 'export const x = crypto.randomUUID();\n',
    check: 'npx eslint packages/rules/src/__bad.ts',
  },
];

let failed = 0;
for (const c of cases) {
  const path = join(root, c.file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, c.body);
  try {
    const res = run(c.check);
    if (res.status === 0) {
      failed++;
      console.error(`NOT CAUGHT: ${c.name}`);
    } else {
      console.log(`caught: ${c.name}`);
    }
  } finally {
    rmSync(path);
  }
}
if (failed) process.exit(1);
console.log(`All ${cases.length} deliberate violations were rejected.`);
