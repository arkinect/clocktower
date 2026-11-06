// A headless client: the same HTTP calls and socket messages a phone makes.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import {
  PROTOCOL_VERSION,
  ServerMessage,
  type Command,
  type PlayerView,
  type RoleCard,
  type RoleId,
  type StorytellerView,
  type View,
} from '@ct/protocol';
import { WebSocket } from 'ws';
import { buildApp, type Built } from '../../src/app';
import { DEFAULT_LIMITS, type Config, type Limits } from '../../src/config';

export interface Target {
  base: string;
  host: string;
  password?: string;
}

export interface Harness extends Target {
  app: Built;
  dir: string;
  logs: string[];
  config: Config;
}

export function testConfig(over: Partial<Config> = {}, limits: Partial<Limits> = {}): Config {
  return {
    port: 0,
    dataDir: mkdtempSync(path.join(tmpdir(), 'ct-server-')),
    webDir: null,
    defaultGame: 'default',
    publicUrl: '',
    sitePassword: '',
    trustedProxies: [],
    trustProxy: false,
    allowedOrigins: [],
    buildId: 'test',
    secureCookies: false,
    hsts: false,
    limits: { ...DEFAULT_LIMITS, ...limits },
    ...over,
  };
}

export async function start(config: Config = testConfig()): Promise<Harness> {
  const logs: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      logs.push(String(chunk));
      done();
    },
  });
  const app = await buildApp(config, stream);
  const port = await app.listen(0);
  const host = `127.0.0.1:${port}`;
  return { app, base: `http://${host}`, host, dir: config.dataDir, logs, config };
}

export async function join(h: Target, name: string, extra: Record<string, unknown> = {}, code = 'default') {
  const res = await fetch(`${h.base}/api/g/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, ...(h.password ? { password: h.password } : {}), ...extra }),
  });
  const cookie = res.headers.get('set-cookie');
  return { status: res.status, cookie, body: (await res.json()) as { ok: boolean; playerId: string; error?: string } };
}

export const tokenOf = (cookie: string | null) => /ct_session=([^;]+)/.exec(cookie ?? '')?.[1] ?? '';

export function open(h: Target, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${h.host}/ws`, { headers, perMessageDeflate: false });
    ws.once('open', () => resolve(ws));
    ws.once('unexpected-response', (_req, res) => reject(new Error(String(res.statusCode))));
    ws.once('error', reject);
  });
}

/** Opens a socket with the client already listening: the first view can arrive with the handshake. */
export async function dial(h: Target, cookie: string, id: string) {
  const ws = new WebSocket(`ws://${h.host}/ws`, { headers: { origin: h.base, cookie }, perMessageDeflate: false });
  const c = new Client(ws, id, cookie);
  await c.until((v) => !!v);
  return c;
}

export class Client {
  raw: string[] = [];
  view: View | null = null;
  catalog: RoleCard[] = [];
  private acks = new Map<string, (m: Extract<ServerMessage, { type: 'ack' }>) => void>();
  private waiters: (() => void)[] = [];
  private next = 0;

  constructor(
    readonly ws: WebSocket,
    readonly id: string,
    readonly cookie: string,
  ) {
    ws.on('message', (data) => {
      const text = String(data);
      this.raw.push(text);
      const m = ServerMessage.parse(JSON.parse(text));
      if (m.type === 'welcome') this.catalog = m.catalog;
      if (m.type === 'view') this.view = m.view;
      if (m.type === 'ack') this.acks.get(m.requestId)?.(m);
      for (const w of this.waiters.splice(0)) w();
    });
  }

  send(command: Command) {
    const requestId = `r${(this.next += 1)}`;
    return new Promise<Extract<ServerMessage, { type: 'ack' }>>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`no ack for ${command.type}`)), 5000);
      this.acks.set(requestId, (m) => {
        clearTimeout(t);
        resolve(m);
      });
      this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'command', requestId, command }));
    });
  }

  /** Sends a command that must be accepted. */
  async do(command: Command) {
    const ack = await this.send(command);
    if (!ack.ok) throw new Error(`${command.type}: ${ack.error}`);
    return ack;
  }

  async until(check: (view: View) => boolean, ms = 5000) {
    const deadline = Date.now() + ms;
    for (;;) {
      if (this.view && check(this.view)) return this.view;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for a view: ${JSON.stringify(this.view?.phase)}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  get me(): PlayerView {
    if (this.view?.kind !== 'player') throw new Error('Not a player view');
    return this.view;
  }

  get grim(): StorytellerView {
    if (this.view?.kind !== 'storyteller') throw new Error('Not a Storyteller view');
    return this.view;
  }

  close() {
    this.ws.terminate();
  }
}

export async function connect(h: Target, name: string, extra: Record<string, unknown> = {}, code = 'default') {
  const j = await join(h, name, extra, code);
  if (!j.body.ok || !j.cookie) throw new Error(`join failed: ${j.body.error}`);
  const cookie = j.cookie.split(';')[0] as string;
  return dial(h, cookie, j.body.playerId);
}

export const roleByName = (catalog: RoleCard[], id: string) => {
  const card = catalog.find((c) => c.roleId === id);
  if (!card) throw new Error(`No role ${id}`);
  return card.roleId as RoleId;
};

/** First legal options for whatever this player must answer tonight. */
export function firstChoices(view: PlayerView) {
  const actions: Record<string, { values: string[]; decline?: boolean }> = {};
  for (const spec of view.me.actions) {
    const used: string[] = [];
    const stuck = spec.fields.some((f) => f.options.length === 0);
    if (stuck && spec.allowDecline) {
      actions[spec.key] = { values: [], decline: true };
      continue;
    }
    actions[spec.key] = {
      values: spec.fields.map((f) => {
        const v = f.options.find((o) => !spec.distinct || !used.includes(o)) ?? '';
        used.push(v);
        return v;
      }),
    };
  }
  return actions;
}

/** A full table: one Storyteller, five players in a cast of real characters, in setup and ready to start. */
export async function table(h: Target, code = 'default') {
  const st = await connect(h, 'Storyteller', { wantsStoryteller: true }, code);
  const names = ['Ann', 'Bo', 'Cy', 'Di', 'Ed'];
  const players: Client[] = [];
  for (const n of names) players.push(await connect(h, n, {}, code));
  const roles = ['clockmaker', 'farmer', 'empath', 'poisoner', 'imp'].map((r) => roleByName(st.catalog, r));
  const extra = ['sailor', 'virgin', 'slayer', 'oracle'].map((r) => roleByName(st.catalog, r));
  await st.do({ type: 'open_setup' });
  await st.do({ type: 'set_script', roleIds: [...roles, ...extra] });
  await st.do({ type: 'randomise_seating' });
  await st.do({ type: 'publish_seating' });
  await st.do({
    type: 'assign_many',
    assignments: Object.fromEntries(players.map((p, i) => [p.id, roles[i] as RoleId])),
  });
  await st.do({ type: 'suggest_bluffs' });
  return { st, players };
}
