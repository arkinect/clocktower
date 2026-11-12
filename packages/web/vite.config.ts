import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The release version is the root package's, shown in the Storyteller's Log tab.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

const server = process.env['VITE_SERVER'] ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { proxy: { '/api': server, '/healthz': server, '/ws': { target: server, ws: true } } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});
