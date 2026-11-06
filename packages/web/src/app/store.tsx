// The latest view and connection state, read through useSyncExternalStore. Nothing here is module-level.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Command, Jinx, RoleCard, ServerMessage, View } from '@ct/protocol';
import type { Names } from '../ui/Picker';
import { ToastView } from '../ui/ui';
import { GameSocket, type Ack } from './socket';
import { sessionFor } from './http';

export interface GameState {
  status: 'connecting' | 'open' | 'offline';
  view: View | null;
  catalog: RoleCard[];
  jinxes: Jinx[];
  reload: boolean;
  /** The session is gone: the player was removed, or the game was archived. */
  signedOut: boolean;
}

const INITIAL: GameState = {
  status: 'connecting',
  view: null,
  catalog: [],
  jinxes: [],
  reload: false,
  signedOut: false,
};

export class GameStore {
  private state = INITIAL;
  private listeners = new Set<() => void>();
  private socket: GameSocket;

  constructor(
    private readonly code: string,
    private readonly buildId: string,
  ) {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    this.socket = new GameSocket(`${scheme}://${location.host}/ws`, buildId, {
      onMessage: (m) => this.receive(m),
      onOpen: () => this.set({ status: 'open' }),
      onClose: (everOpened) => void this.closed(everOpened),
    });
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = () => this.state;

  start() {
    this.socket.start();
  }

  stop() {
    this.socket.stop();
  }

  send(command: Command): Promise<Ack> {
    return this.socket.send(command);
  }

  private set(patch: Partial<GameState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private receive(m: ServerMessage) {
    if (m.type === 'welcome') {
      this.set({ catalog: m.catalog, jinxes: m.jinxes, reload: this.state.reload || m.buildId !== this.buildId });
    } else if (m.type === 'view') this.set({ view: m.view });
    else if (m.type === 'reload') this.set({ reload: true });
    else if (m.type === 'removed') this.signOut();
  }

  private signOut() {
    this.socket.stop();
    this.set({ signedOut: true });
  }

  private async closed(everOpened: boolean) {
    this.set({ status: 'offline' });
    if (everOpened) return;
    // A refused socket looks like a network failure to a browser, so ask whether the session is still good.
    const session = await sessionFor(this.code).catch(() => undefined);
    if (session === null) this.signOut();
  }
}

const StoreContext = createContext<GameStore | null>(null);
const ToastContext = createContext<(text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const clear = useCallback(() => setText(null), []);
  return (
    <ToastContext.Provider value={setText}>
      {children}
      {text && <ToastView text={text} onDone={clear} />}
    </ToastContext.Provider>
  );
}

export function GameProvider({ code, buildId, children }: { code: string; buildId: string; children: ReactNode }) {
  const [store] = useState(() => new GameStore(code, buildId));
  useEffect(() => {
    store.start();
    return () => store.stop();
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useGame needs a GameProvider');
  return store;
}

export function useGame(): GameState {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Display names for ids, from what the server sent. */
export function useNames(): Names {
  const { view, catalog } = useGame();
  const players = view?.players;
  return useMemo(
    () => ({
      players: Object.fromEntries((players ?? []).map((p) => [p.id, p.name])),
      roles: Object.fromEntries(catalog.map((c) => [c.roleId, c.name])),
    }),
    [players, catalog],
  );
}

/** Sends a command, tracks whether it is pending, and shows any error in a toast. */
export function useCommand() {
  const store = useStore();
  const toast = useContext(ToastContext);
  const [pending, setPending] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const run = useCallback(
    async (command: Command) => {
      setPending(true);
      const ack = await store.send(command);
      if (live.current) setPending(false);
      if (!ack.ok) toast(ack.error ?? 'Something went wrong.');
      return ack;
    },
    [store, toast],
  );
  return { run, pending };
}
