import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  // The old engine is imported by the parity harness only, and goes at cutover.
  resolve: {
    alias: {
      '@old/engine': here('./test/parity/old-engine.mjs'),
      '@ct/shared': here('../../shared/src/index.ts'),
    },
  },
  define: { __FUZZ_GAMES__: Number(process.env.FUZZ_GAMES ?? 500) },
  test: { include: ['test/**/*.test.ts'] },
});
