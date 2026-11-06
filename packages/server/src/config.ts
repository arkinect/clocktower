// Everything tunable. The numbers are starting values.
import path from 'node:path';

export interface Limits {
  /** Tokens a second and burst for requests with no session, across all addresses. */
  unauthRate: number;
  unauthBurst: number;
  /** The same, per address. A whole table can share one address, so this has room for everyone arriving at once. */
  unauthRatePerIp: number;
  unauthBurstPerIp: number;
  socketsPerSession: number;
  socketsPerIp: number;
  socketMessagesPerSecond: number;
  socketBurst: number;
  socketMaxPayload: number;
  heartbeatMs: number;
  /** Heartbeats a socket may miss before it is dropped. */
  heartbeatMisses: number;
  playersPerGame: number;
  liveGames: number;
  nameLength: number;
  commandsPerGame: number;
  queuePerGame: number;
  bodyBytes: number;
  archiveKeep: number;
  backoffStartMs: number;
  backoffMaxMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  unauthRate: 20,
  unauthBurst: 120,
  unauthRatePerIp: 5,
  unauthBurstPerIp: 60,
  socketsPerSession: 3,
  socketsPerIp: 200,
  socketMessagesPerSecond: 10,
  socketBurst: 20,
  socketMaxPayload: 16 * 1024,
  heartbeatMs: 20_000,
  heartbeatMisses: 2,
  playersPerGame: 30,
  liveGames: 4,
  nameLength: 24,
  commandsPerGame: 20_000,
  queuePerGame: 32,
  bodyBytes: 64 * 1024,
  archiveKeep: 20,
  backoffStartMs: 1000,
  backoffMaxMs: 5 * 60_000,
};

export interface Config {
  port: number;
  dataDir: string;
  webDir: string | null;
  defaultGame: string;
  publicUrl: string;
  sitePassword: string;
  /** Caddy's addresses: the only peers whose X-Forwarded-For is believed. */
  trustedProxies: string[];
  trustProxy: boolean;
  /** Exact Origins allowed to open a socket. Empty means same host as the request (LAN). */
  allowedOrigins: string[];
  buildId: string;
  secureCookies: boolean;
  /** Off by default: HSTS binds the whole host name, on every port, so it breaks plain-HTTP services sharing it. */
  hsts: boolean;
  limits: Limits;
}

export class StartupRefused extends Error {}

/** A stranger could otherwise claim the Storyteller seat and erase the game. */
export function assertSafe(c: Pick<Config, 'trustProxy' | 'publicUrl' | 'sitePassword'>) {
  const exposed = c.trustProxy || c.publicUrl.startsWith('https://');
  if (exposed && !c.sitePassword) {
    throw new StartupRefused('Refusing to start: this server is exposed but SITE_PASSWORD is not set.');
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const publicUrl = env['PUBLIC_URL'] ?? '';
  const proxy = env['TRUST_PROXY'] ?? '';
  const config: Config = {
    port: Number(env['PORT'] ?? 8080),
    dataDir: env['DATA_DIR'] ?? path.resolve('data'),
    webDir: env['WEB_DIR'] ?? null,
    defaultGame: env['DEFAULT_GAME_CODE'] ?? 'default',
    publicUrl,
    sitePassword: env['SITE_PASSWORD'] ?? '',
    trustProxy: !!proxy,
    trustedProxies: proxy
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    allowedOrigins: publicUrl ? [new URL(publicUrl).origin] : [],
    buildId: env['BUILD_ID'] ?? 'dev',
    secureCookies: publicUrl.startsWith('https://'),
    hsts: env['HSTS'] === '1' || env['HSTS'] === 'true',
    limits: DEFAULT_LIMITS,
  };
  assertSafe(config);
  return config;
}
