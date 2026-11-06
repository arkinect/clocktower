// Floods joins and unauthenticated sockets at a built server while a scripted game runs. Run with `npm run load`.
// The table must not notice: p95 command round trip stays under 250ms.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import autocannon from 'autocannon';
import { WebSocket } from 'ws';
import { table, type Target } from '../helpers/client';

const SECONDS = Number(process.env['LOAD_SECONDS'] ?? 15);
const LIMIT_MS = 250;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const a = s.address();
      s.close(() => resolve(typeof a === 'object' && a ? a.port : 0));
    });
  });

async function waitUp(base: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('The server did not start');
}

async function socketFlood(host: string, until: number) {
  let refused = 0;
  while (Date.now() < until) {
    await Promise.all(
      Array.from(
        { length: 25 },
        () =>
          new Promise<void>((resolve) => {
            const ws = new WebSocket(`ws://${host}/ws`, { headers: { origin: `http://${host}` } });
            ws.on('error', () => {
              refused += 1;
              resolve();
            });
            ws.on('open', () => {
              ws.terminate();
              resolve();
            });
          }),
      ),
    );
  }
  return refused;
}

async function main() {
  const port = await freePort();
  const host = `127.0.0.1:${port}`;
  const target: Target = { base: `http://${host}`, host };
  const server = spawn(process.execPath, ['dist/main.cjs'], {
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: mkdtempSync(path.join(tmpdir(), 'ct-load-')),
      LOG_LEVEL: 'warn',
    },
    stdio: 'inherit',
  });
  try {
    await waitUp(target.base);
    const { st, players } = await table(target);
    await st.do({ type: 'begin_first_night', force: true });
    await st.do({ type: 'open_collecting' });
    await st.do({ type: 'close_collecting', force: true });
    await st.do({ type: 'accept_all_defaults' });
    await st.do({ type: 'publish_dawn', force: true });
    const until = Date.now() + SECONDS * 1000;
    const flood = autocannon({
      url: `${target.base}/api/g/default/join`,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Flood' }),
      connections: 50,
      duration: SECONDS,
    });
    const sockets = socketFlood(host, until);
    const times: number[] = [];
    let i = 0;
    while (Date.now() < until) {
      const p = players[i % players.length];
      const started = performance.now();
      if (i % 2 === 0) await st.do({ type: 'set_notes', text: `round ${i}` });
      else if (p) await p.send({ type: 'seen_role' });
      times.push(performance.now() - started);
      i += 1;
      await new Promise((r) => setTimeout(r, 50));
    }
    const [result, refused] = await Promise.all([flood, sockets]);
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)] ?? Infinity;
    const report = {
      commands: times.length,
      p50: Math.round(times[Math.floor(times.length / 2)] ?? 0),
      p95: Math.round(p95),
      max: Math.round(times.at(-1) ?? 0),
      floodRequests: result.requests.total,
      flood2xx: result['2xx'],
      flood4xx: result['4xx'],
      socketsRefused: refused,
    };
    console.log(JSON.stringify(report));
    process.exitCode = p95 < LIMIT_MS ? 0 : 1;
  } finally {
    server.kill();
    setTimeout(() => process.exit(), 200);
  }
}

void main();
