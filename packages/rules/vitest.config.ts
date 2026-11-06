import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __FUZZ_GAMES__: Number(process.env.FUZZ_GAMES ?? 500) },
  test: { include: ['test/**/*.test.ts'] },
});
