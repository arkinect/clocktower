import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const PORT = 4173;
/** The steward's own server: one holds four games, which the other specs fill. */
const STEWARD_PORT = 4174;

const server = (port: number) => ({
  // The built bundle, as it runs in production.
  command: 'node ../server/dist/main.cjs',
  url: `http://127.0.0.1:${port}/healthz`,
  reuseExistingServer: false,
  env: {
    PORT: String(port),
    WEB_DIR: 'dist',
    DATA_DIR: path.join(tmpdir(), `ct-e2e-${process.pid}-${port}`),
    LOG_LEVEL: 'warn',
  },
});

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, viewport: { width: 360, height: 720 }, actionTimeout: 15_000 },
  webServer: [server(PORT), server(STEWARD_PORT)],
});
