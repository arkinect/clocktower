import { defineConfig } from 'vitest/config';

// The floor applies when coverage is on (npm run test:coverage). It sits a little under where the package is.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], coverage: { thresholds: { lines: 91 } } },
});
