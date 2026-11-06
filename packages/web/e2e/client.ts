// A scripted Storyteller for the player tests: the same HTTP calls and socket messages the console makes.
import { PROTOCOL_VERSION, type Command, type RoleCard, type ServerMessage, type StorytellerView } from '@ct/protocol';
import { WebSocket } from 'ws';

export const BASE = 'http://127.0.0.1:4173';

export class Scripted {
  view: StorytellerView | null = null;
  catalog: RoleCard[] = [];
  private acks = new Map<string, (m: Extract<ServerMessage, { type: 'ack' }>) => void>();
  private next = 0;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const m = JSON.parse(String(data)) as ServerMessage;
      if (m.type === 'welcome') this.catalog = m.catalog;
      if (m.type === 'view' && m.view.kind === 'storyteller') this.view = m.view;
      if (m.type === 'ack') this.acks.get(m.requestId)?.(m);
    });
  }

  static async join(code: string) {
    const res = await fetch(`${BASE}/api/g/${code}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Storyteller', wantsStoryteller: true }),
    });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { origin: BASE, cookie } });
    const client = new Scripted(ws);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return client;
  }

  do(command: Command) {
    this.next += 1;
    const requestId = `r${this.next}`;
    return new Promise<void>((resolve, reject) => {
      this.acks.set(requestId, (m) => (m.ok ? resolve() : reject(new Error(`${command.type}: ${m.error}`))));
      this.ws.send(JSON.stringify({ v: PROTOCOL_VERSION, type: 'command', requestId, command }));
    });
  }

  role(id: string) {
    const card = this.catalog.find((c) => c.roleId === id);
    if (!card) throw new Error(`No role ${id}`);
    return card.roleId;
  }

  async waitFor(check: (v: StorytellerView) => boolean) {
    for (let i = 0; i < 200; i++) {
      if (this.view && check(this.view)) return this.view;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`Timed out in ${JSON.stringify(this.view?.phase)}`);
  }

  id(name: string) {
    const p = this.view?.players.find((x) => x.name === name);
    if (!p) throw new Error(`No player ${name}`);
    return p.id;
  }
}
