import { lookup } from 'node:dns/promises';
import { buildApp } from './app';
import { StartupRefused, loadConfig } from './config';

/** TRUST_PROXY may name Caddy's container; the check itself compares addresses. */
async function resolveProxies(names: string[]) {
  const out: string[] = [];
  for (const name of names) {
    try {
      out.push(...(await lookup(name, { all: true })).map((a) => a.address));
    } catch {
      out.push(name);
    }
  }
  return out;
}

async function main() {
  const config = loadConfig(process.env);
  const names = config.trustedProxies;
  config.trustedProxies = await resolveProxies(names);
  // Caddy can come back on a new address, and every client would then look like one.
  setInterval(() => {
    void resolveProxies(names).then((found) => {
      config.trustedProxies = found;
    });
  }, 60_000).unref();
  const app = await buildApp(config);
  await app.listen();
  const stop = () => void app.close().then(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((e: unknown) => {
  console.error(e instanceof StartupRefused ? e.message : e);
  process.exit(1);
});
