// Scripted people for the browser tests: the same HTTP calls and socket messages the real apps make.
import {
  PROTOCOL_VERSION,
  type Command,
  type PlayerView,
  type RoleCard,
  type ServerMessage,
  type StorytellerView,
  type View,
} from '@ct/protocol';
import { WebSocket } from 'ws';

export const BASE = 'http://127.0.0.1:4173';

class Scripted<V extends View> {
  view: V | null = null;
  catalog: RoleCard[] = [];
  id = '';
  private acks = new Map<string, (m: Extract<ServerMessage, { type: 'ack' }>) => void>();
  private next = 0;

  constructor(
    readonly ws: WebSocket,
    id: string,
  ) {
    this.id = id;
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      if (m.type === 'welcome') this.catalog = m.catalog;
      if (m.type === 'view') this.view = m.view as V;
      if (m.type === 'ack') this.acks.get(m.requestId)?.(m);
    });
  }

  do(command: Command) {
    this.next += 1;
    const requestId = `r${this.next}`;
    return new Promise<void>((resolve, reject) => {
      this.acks.set(requestId, (m) => (m.ok ? resolve() : reject(new Error(`${command.type}: ${m.error}`))));
      this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'command', requestId, command }));
    });
  }

  async waitFor(check: (v: V) => boolean) {
    for (let i = 0; i < 400; i++) {
      if (this.view && check(this.view)) return this.view;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Timed out in ${JSON.stringify(this.view?.phase)}`);
  }
}

async function open(code: string, name: string, wantsStoryteller: boolean) {
  const res = await fetch(`${BASE}/api/g/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, wantsStoryteller }),
  });
  const body = (await res.json()) as { playerId: string };
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { origin: BASE, cookie } });
  return { ws, id: body.playerId };
}

const opened = (ws: WebSocket) =>
  new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

export class ScriptedStoryteller extends Scripted<StorytellerView> {
  static async join(code: string) {
    const { ws, id } = await open(code, 'Storyteller', true);
    const client = new ScriptedStoryteller(ws, id);
    await opened(ws);
    return client;
  }

  role(id: string) {
    const card = this.catalog.find((c) => c.roleId === id);
    if (!card) throw new Error(`No role ${id}`);
    return card.roleId;
  }

  player(name: string) {
    const p = this.view?.players.find((x) => x.name === name);
    if (!p) throw new Error(`No player ${name}`);
    return p.id;
  }
}

export class ScriptedPlayer extends Scripted<PlayerView> {
  static async join(code: string, name: string) {
    const { ws, id } = await open(code, name, false);
    const client = new ScriptedPlayer(ws, id);
    await opened(ws);
    return client;
  }

  /** Submits tonight's action, taking the first option `prefer` allows for each field. */
  async submit(prefer: (option: string) => boolean = () => true) {
    const view = await this.waitFor((v) => v.phase.stage === 'collecting');
    const actions: Record<string, { values: string[] }> = {};
    for (const spec of view.me.actions) {
      const used: string[] = [];
      const values = spec.fields.map((f) => {
        const free = f.options.filter((o) => !spec.distinct || !used.includes(o));
        const v = free.find(prefer) ?? (free[0] as string);
        used.push(v);
        return v;
      });
      actions[spec.key] = { values };
    }
    await this.do({ type: 'submit_night', actions });
  }
}
