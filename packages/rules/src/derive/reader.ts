// Read helpers over a game state. Everything a hook may ask about the world, and nothing that changes it.
import type { Alignment, CharacterType, PlayerId, RoleId } from '@ct/protocol';
import { allRoles, findRole, jinxBetween, roleDef } from '../abilities/registry';
import type { GameEvent, GameState, Moment, Player } from '../model/state';
import { momentOrder } from '../model/state';
import type { Instance, RoleDef } from '../abilities/define';

export class Reader {
  constructor(
    readonly w: GameState,
    readonly moment: Moment,
  ) {}

  /** Players in seat order, clockwise, skipping departed Travellers. Dead players keep their seat. */
  get seated(): PlayerId[] {
    return this.w.seats.filter((s) => s.left === null).map((s) => s.playerId);
  }

  get alive(): PlayerId[] {
    return this.seated.filter((id) => this.isAlive(id));
  }

  player(id: PlayerId): Player {
    const p = this.w.players[id];
    if (!p) throw new Error(`No player ${id}`);
    return p;
  }

  has(id: string): id is PlayerId {
    return !!this.w.players[id];
  }

  isSeated = (id: PlayerId) => this.seated.includes(id);
  isAlive = (id: PlayerId) => !!this.w.players[id]?.life.alive;
  name = (id: string | null | undefined) => (id ? (this.w.players[id]?.name ?? '(nobody)') : '(nobody)');
  roleName = (id: RoleId | string | null | undefined) => (id ? (findRole(id)?.name ?? id) : '(none)');
  character = (id: PlayerId): RoleId | null => this.w.players[id]?.character ?? null;
  alignmentOf = (id: PlayerId): Alignment => this.w.players[id]?.alignment ?? 'good';

  typeOf = (id: PlayerId): CharacterType | null => {
    const r = this.character(id);
    return r ? roleDef(r).type : null;
  };

  /** A player with a Demon character, or holding an ability that makes them the Demon. */
  isDemon = (id: PlayerId): boolean =>
    this.typeOf(id) === 'demon' || this.abilitiesOf(id).some((a) => roleDef(a.roleId).flags.holderIsDemon);

  get demons(): PlayerId[] {
    return this.seated.filter(this.isDemon);
  }

  get minions(): PlayerId[] {
    return this.seated.filter((id) => this.typeOf(id) === 'minion');
  }

  get inPlay(): RoleId[] {
    return this.seated.map(this.character).filter((x): x is RoleId => !!x);
  }

  /** What the players were told they are, for checks of "this character is in play". */
  get believedInPlay(): RoleId[] {
    return this.seated.map((id) => this.w.setup.bag[id]).filter((x): x is RoleId => !!x);
  }

  /** The roles on the script, in sheet order. */
  get script(): RoleId[] {
    return allRoles()
      .filter((r) => this.w.script.includes(r.id))
      .map((r) => r.id);
  }

  scriptOfType = (type: CharacterType): RoleId[] => this.script.filter((r) => roleDef(r).type === type);
  onScript = (id: RoleId) => !!findRole(id) && this.w.script.includes(id);
  role = (id: RoleId): RoleDef => roleDef(id);

  isActive = (a: Instance): boolean =>
    a.activeUntil !== 'removed' && momentOrder(a.activeFrom) <= momentOrder(this.moment);

  get instances(): Instance[] {
    return Object.values(this.w.abilities).filter(this.isActive);
  }

  /** The player's active abilities, in the order they were gained. */
  abilitiesOf = (id: PlayerId): Instance[] =>
    this.instances.filter((a) => a.holder.kind === 'player' && a.holder.id === id);

  abilityOf = (id: PlayerId, role: RoleId): Instance | undefined => this.abilitiesOf(id).find((a) => a.roleId === role);

  hasAbility = (id: PlayerId, role: RoleId): boolean => !!this.abilityOf(id, role);
  playersWith = (role: RoleId): PlayerId[] => this.seated.filter((id) => this.hasAbility(id, role));

  /** A player acting on their character's own ability or one they really gained, not one they only believe in. */
  isBelieved = (a: Instance): boolean =>
    a.origin.kind === 'character' && a.holder.kind === 'player' && this.w.players[a.holder.id]?.character !== a.roleId;

  /** Nearest alive player each way round, skipping dead seats and the player. */
  aliveNeighbours = (id: PlayerId): PlayerId[] => this.nearest(id, this.isAlive, true);

  /** Closest player matching each way round, alive or dead. At most 2, no repeats. */
  nearest = (id: PlayerId, pred: (p: PlayerId) => boolean, keepOrder = false): PlayerId[] => {
    const order = this.seated;
    const i = order.indexOf(id);
    if (i < 0) return [];
    const n = order.length;
    const found: PlayerId[] = [];
    for (const dir of [-1, 1]) {
      for (let k = 1; k < n; k++) {
        const cand = order[(i + dir * k + n * k) % n] as PlayerId;
        if (cand !== id && pred(cand)) {
          found.push(cand);
          break;
        }
      }
    }
    return keepOrder && found.length === 2 && found[0] === found[1] ? [found[0] as PlayerId] : [...new Set(found)];
  };

  /** Seats between two players the shorter way round; adjacent is 1. */
  seatDistance = (a: PlayerId, b: PlayerId): number => {
    const order = this.seated;
    const d = Math.abs(order.indexOf(a) - order.indexOf(b));
    return Math.min(d, order.length - d);
  };

  areNeighbours = (a: PlayerId, b: PlayerId) => this.seatDistance(a, b) === 1;

  eventsAt = (at: Moment): GameEvent[] => this.w.events.filter((e) => e.at.kind === at.kind && e.at.n === at.n);

  /** Events of the day just before this night. */
  get today(): GameEvent[] {
    return this.eventsAt({ kind: 'day', n: this.moment.n });
  }

  /** The latest value any holder of a role stored in a setup field, even one that has since gone. */
  setupValue(role: RoleId, field: string): string | null {
    let value: string | null = null;
    for (const a of Object.values(this.w.abilities)) {
      const s = a.state as { setup?: Record<string, string | null> } | undefined;
      if (a.roleId === role && s?.setup?.[field]) value = s.setup[field] ?? null;
    }
    return value;
  }

  /** Living players who are not Travellers: the count role text means by "players alive". */
  get aliveResidents(): PlayerId[] {
    return this.alive.filter((id) => this.typeOf(id) !== 'traveller');
  }

  jinxWith = (a: RoleId, b: RoleId) => jinxBetween(a, b);
}
