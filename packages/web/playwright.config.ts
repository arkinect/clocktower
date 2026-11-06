import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 360, height: 720 } },
  webServer: {
    // The built bundle, as it runs in production.
    command: 'node ../server/dist/main.cjs',
    url: `http://127.0.0.1:${PORT}/healthz`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      WEB_DIR: 'dist',
      DATA_DIR: path.join(tmpdir(), `ct-e2e-${process.pid}`),
      LOG_LEVEL: 'warn',
    },
  },
});
