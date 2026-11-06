// One connection per tab: reconnects with backoff, matches acks to requests, and never holds game logic.
import { PROTOCOL_VERSION, type ClientMessage, type Command, type ServerMessage } from '@ct/protocol';

export interface Ack {
  ok: boolean;
  error?: string | undefined;
  data?: unknown;
}

export interface SocketEvents {
  onMessage(m: ServerMessage): void;
  onOpen(): void;
  onClose(everOpened: boolean): void;
}

const ACK_TIMEOUT_MS = 8000;
const MAX_BACKOFF_MS = 10_000;

export class GameSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private retry: number | undefined;
  private next = 0;
  private pending = new Map<string, { done: (a: Ack) => void; timer: number }>();

  constructor(
    private readonly url: string,
    private readonly buildId: string,
    private readonly events: SocketEvents,
  ) {}

  start() {
    this.stopped = false;
    this.open();
    window.addEventListener('online', this.now);
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.retry);
    window.removeEventListener('online', this.now);
    this.ws?.close();
    this.failAll('Disconnected.');
  }

  /** The phone came back: skip whatever is left of the backoff. */
  private now = () => {
    if (this.ws?.readyState === WebSocket.OPEN || this.stopped) return;
    window.clearTimeout(this.retry);
    this.attempt = 0;
    this.open();
  };

  private open() {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    let opened = false;
    ws.onopen = () => {
      opened = true;
      this.attempt = 0;
      this.raw({ v: PROTOCOL_VERSION, type: 'hello', buildId: this.buildId });
      this.events.onOpen();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as ServerMessage;
      if (m.type === 'ack') this.settle(m.requestId, m);
      this.events.onMessage(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.failAll('Connection lost. Try again.');
      this.events.onClose(opened);
      if (this.stopped) return;
      const wait = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt) * (0.75 + Math.random() / 2);
      this.attempt += 1;
      this.retry = window.setTimeout(() => this.open(), wait);
    };
  }

  private raw(m: ClientMessage) {
    this.ws?.send(JSON.stringify(m));
  }

  send(command: Command): Promise<Ack> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, error: 'Not connected. Try again in a moment.' });
    }
    this.next += 1;
    const requestId = `r${this.next}`;
    return new Promise((done) => {
      const timer = window.setTimeout(
        () => this.settle(requestId, { ok: false, error: 'No answer from the server. Try again.' }),
        ACK_TIMEOUT_MS,
      );
      this.pending.set(requestId, { done, timer });
      this.raw({ v: PROTOCOL_VERSION, type: 'command', requestId, command });
    });
  }

  private settle(requestId: string, ack: Ack) {
    const row = this.pending.get(requestId);
    if (!row) return;
    window.clearTimeout(row.timer);
    this.pending.delete(requestId);
    row.done(ack);
  }

  private failAll(error: string) {
    for (const id of [...this.pending.keys()]) this.settle(id, { ok: false, error });
  }
}
