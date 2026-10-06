import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  resolve: { alias: { '@ct/shared': path.resolve(__dirname, '../shared/src/index.ts') } },
  test: { include: ['test/**/*.test.ts'] },
});
