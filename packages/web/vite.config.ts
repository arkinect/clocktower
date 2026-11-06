import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const server = process.env['VITE_SERVER'] ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': server, '/healthz': server, '/ws': { target: server, ws: true } } },
  test: { environment: 'jsdom', include: ['test/**/*.test.{ts,tsx}'] },
});
