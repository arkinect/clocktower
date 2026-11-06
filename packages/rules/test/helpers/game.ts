// A small language for driving the engine in tests. Every step goes through dispatch and is logged.
import type { Command, PlayerId, RoleId } from '@ct/protocol';
import { createGame, dispatch, playerView, storytellerView, type GameStateT, type LogEntry } from '../../src';
import { PLAIN_SCRIPT } from './plain';

export const ST = 'st' as PlayerId;
export const pid = (name: string) => name.toLowerCase() as PlayerId;

export class TestGame {
  state: GameStateT;
  log: LogEntry[] = [];
  now = 1000;
  seed = 1;
  data: unknown;

  constructor(
    readonly code = 'TEST',
    readonly createdAt = 0,
  ) {
    this.state = createGame(code, createdAt);
  }

  tryAs(actor: PlayerId | null, command: Command) {
    this.now += 1000;
    this.seed += 1;
    const res = dispatch(this.state, actor, command, { now: this.now, seed: this.seed });
    if (res.ok) {
      this.state = res.state;
      this.log.push(res.entry);
      this.data = res.data;
    }
    return res;
  }

  as(actor: PlayerId | null, command: Command) {
    const res = this.tryAs(actor, command);
    if (!res.ok) throw new Error(`${command.type} rejected: ${res.error}`);
    return this;
  }

  /** A Storyteller command. */
  st(command: Command) {
    return this.as(ST, command);
  }

  rejected(actor: PlayerId | null, command: Command): string {
    const res = this.tryAs(actor, command);
    if (res.ok) throw new Error(`${command.type} should have been rejected`);
    if (res.internal) throw new Error(res.error);
    return res.error;
  }

  view(id: PlayerId) {
    return playerView(this.state, id, this.now);
  }

  grimoire() {
    return storytellerView(this.state, ST, { now: this.now });
  }

  player(id: PlayerId) {
    const p = this.state.players[id];
    if (!p) throw new Error(`No player ${id}`);
    return p;
  }
}

/** A lobby with a Storyteller and these players, seated in this order and in setup. */
export function seated(names: readonly string[], script: readonly RoleId[] = PLAIN_SCRIPT): TestGame {
  const g = new TestGame();
  g.as(null, { type: 'join', id: ST, name: 'Storyteller', rolePreference: 'none', wantsStoryteller: true });
  for (const n of names) {
    g.as(null, { type: 'join', id: pid(n), name: n, rolePreference: 'none', wantsStoryteller: false });
  }
  g.st({ type: 'open_setup' });
  g.st({ type: 'set_script', roleIds: [...script] });
  g.st({ type: 'set_seating', order: names.map(pid) });
  return g;
}

export interface Cast {
  [name: string]: RoleId;
}

/** Seats the cast and assigns their characters, in setup. */
export function cast(chars: Cast, extraScript: readonly RoleId[] = []): TestGame {
  const names = Object.keys(chars);
  const g = seated(names, [...new Set([...PLAIN_SCRIPT, ...Object.values(chars), ...extraScript])]);
  for (const [n, r] of Object.entries(chars)) g.st({ type: 'assign_character', playerId: pid(n), roleId: r });
  return g;
}

/** Runs setup to Night 0, then past the briefing. */
export function begin(g: TestGame): TestGame {
  g.st({ type: 'begin_first_night', force: true });
  g.st({ type: 'open_collecting' });
  return g;
}

export const toReview = (g: TestGame) => g.st({ type: 'close_collecting', force: true });
export const publish = (g: TestGame) => g.st({ type: 'publish_dawn', force: true });
export const dawn = (g: TestGame) => publish(toReview(g));
export const dusk = (g: TestGame) => g.st({ type: 'start_night' });
