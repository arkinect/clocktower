// The connection a tab keeps: what it says on opening, how an ack finds its command, and how it comes back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION, type ServerMessage } from '@ct/protocol';
import { GameSocket, type SocketEvents } from '../src/app/socket';

/** A socket the test opens, answers and drops by hand. */
class FakeSocket {
  static readonly OPEN = 1;
  static made: FakeSocket[] = [];
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeSocket.made.push(this);
  }

  send(text: string) {
    this.sent.push(JSON.parse(text) as Record<string, unknown>);
  }

  close() {
    this.drop();
  }

  accept() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }

  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

const latest = () => FakeSocket.made.at(-1) as FakeSocket;
const command = { type: 'open_setup' } as const;

let events: { [K in keyof SocketEvents]: ReturnType<typeof vi.fn> };
let socket: GameSocket;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', FakeSocket);
  // The middle of the jitter, so a wait is exactly its nominal length.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  FakeSocket.made = [];
  events = { onMessage: vi.fn(), onOpen: vi.fn(), onClose: vi.fn() };
  socket = new GameSocket('ws://test/ws', 'build-1', events as unknown as SocketEvents);
  socket.start();
});

afterEach(() => {
  socket.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the game socket', () => {
  it('says hello with its build as soon as it opens', () => {
    latest().accept();
    expect(latest().url).toBe('ws://test/ws');
    expect(latest().sent).toEqual([{ v: PROTOCOL_VERSION, type: 'hello', buildId: 'build-1' }]);
    expect(events.onOpen).toHaveBeenCalledTimes(1);
  });

  it('gives each command the ack that carries its request id, and passes every message on', async () => {
    latest().accept();
    const first = socket.send(command);
    const second = socket.send(command);
    const ids = latest()
      .sent.filter((m) => m['type'] === 'command')
      .map((m) => m['requestId']);
    expect(new Set(ids).size).toBe(2);
    const refused = { v: PROTOCOL_VERSION, type: 'ack', requestId: ids[1], ok: false, error: 'No.' };
    latest().receive(refused);
    latest().receive({ v: PROTOCOL_VERSION, type: 'ack', requestId: ids[0], ok: true });
    expect(await second).toMatchObject({ ok: false, error: 'No.' });
    expect(await first).toMatchObject({ ok: true });
    expect(events.onMessage).toHaveBeenCalledWith(refused as unknown as ServerMessage);
  });

  it('refuses a command at once while it is not connected', async () => {
    expect(await socket.send(command)).toEqual({ ok: false, error: 'Not connected. Try again in a moment.' });
    expect(latest().sent).toEqual([]);
  });

  it('gives up on a command the server never answers', async () => {
    latest().accept();
    const ack = socket.send(command);
    vi.advanceTimersByTime(7999);
    let settled = false;
    void ack.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await ack).toEqual({ ok: false, error: 'No answer from the server. Try again.' });
  });

  it('fails whatever was waiting when the connection drops, and says whether it had ever opened', async () => {
    latest().accept();
    const ack = socket.send(command);
    latest().drop();
    expect(await ack).toEqual({ ok: false, error: 'Connection lost. Try again.' });
    expect(events.onClose).toHaveBeenLastCalledWith(true);
    vi.advanceTimersByTime(500);
    latest().drop();
    expect(events.onClose).toHaveBeenLastCalledWith(false);
  });

  it('reconnects after a wait that doubles, and starts over once a connection opens', () => {
    latest().accept();
    latest().drop();
    vi.advanceTimersByTime(499);
    expect(FakeSocket.made).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.made).toHaveLength(2);
    latest().drop();
    vi.advanceTimersByTime(999);
    expect(FakeSocket.made).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.made).toHaveLength(3);
    latest().accept();
    latest().drop();
    vi.advanceTimersByTime(500);
    expect(FakeSocket.made).toHaveLength(4);
  });

  it('never waits longer than ten seconds', () => {
    for (let i = 0; i < 8; i++) {
      latest().drop();
      vi.advanceTimersByTime(10_000);
    }
    expect(FakeSocket.made).toHaveLength(9);
  });

  it('reconnects at once when the phone comes back online', () => {
    latest().accept();
    latest().drop();
    window.dispatchEvent(new Event('online'));
    expect(FakeSocket.made).toHaveLength(2);
    // The wait that was running is gone with it: no second connection follows.
    vi.advanceTimersByTime(10_000);
    expect(FakeSocket.made).toHaveLength(2);
    // And a healthy connection is left alone.
    latest().accept();
    window.dispatchEvent(new Event('online'));
    expect(FakeSocket.made).toHaveLength(2);
  });

  it('stays closed once stopped', async () => {
    latest().accept();
    const ack = socket.send(command);
    socket.stop();
    expect(await ack).toMatchObject({ ok: false });
    vi.advanceTimersByTime(60_000);
    window.dispatchEvent(new Event('online'));
    expect(FakeSocket.made).toHaveLength(1);
  });
});
