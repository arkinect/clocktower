import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __FUZZ_GAMES__: Number(process.env.FUZZ_GAMES ?? 500) },
  // The floor applies when coverage is on (npm run test:coverage). It sits a little under where the package is.
  test: { include: ['test/**/*.test.ts'], coverage: { thresholds: { lines: 96 } } },
});
