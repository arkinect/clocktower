// The card tables of one game, in memory only. A hand belongs to its player, not to a seat: when they leave it goes
// with them, and when they come back they bring it to whichever table has room. Players are packed onto as few
// tables as possible. A seat with no player in it is played by a bot holding a hand of its own.
import type { Card, CardsAction, CardsView } from '@ct/protocol';
import {
  COLOURS,
  HAND_SIZE,
  bestColour,
  canPlay,
  chooseMove,
  deal,
  draw,
  pass,
  play,
  playable,
  take,
  topCard,
  type Rnd,
  type Round,
} from './rules';

export const SEATS = 4;

export interface CardsHost {
  /** Whether this player may be at a table now: seated in the game, with nothing left to do tonight. */
  eligible(playerId: string): boolean;
  /** Null tells the phone it has no place at a table just now. */
  send(playerId: string, table: CardsView | null): void;
}

export interface CardsTiming {
  /** How long a player has for a turn before a bot takes their place. */
  turnMs: number;
  /** A bot takes between these two to play. */
  botMinMs: number;
  botMaxMs: number;
  /** Now and then a bot stops to think, for up to this much longer. */
  botThinkMs: number;
  /** How long a finished round stays up before the next deal. */
  roundGapMs: number;
}

export const DEFAULT_TIMING: CardsTiming = {
  turnMs: 15_000,
  botMinMs: 600,
  botMaxMs: 2400,
  botThinkMs: 4000,
  roundGapMs: 4000,
};

interface Table {
  /** Who is in each seat: a player's id, or null for a bot. The cards they hold are in `round.hands`. */
  seats: (string | null)[];
  round: Round;
  timer: NodeJS.Timeout | undefined;
  deadline: number | null;
}

interface Place {
  table: Table;
  seat: number;
}

/** Every seat always has someone in it, a player or a bot, so nobody is ever passed over. */
const ALL: readonly boolean[] = Array.from({ length: SEATS }, () => true);

/** Each table numbers its cards from its own block, so a hand carried to another table never clashes. */
const ID_BLOCK = 1_000_000;

const order = (c: Card) => (c.colour ? COLOURS.indexOf(c.colour) : COLOURS.length) * 100 + (c.id % 108);

export class Tables {
  private tables: Table[] = [];
  private places = new Map<string, Place>();
  /** The hands of players who are away. */
  private kept = new Map<string, Card[]>();
  private opened = 0;

  constructor(
    private readonly host: CardsHost,
    private readonly timing: CardsTiming = DEFAULT_TIMING,
    private readonly rnd: Rnd = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  handle(playerId: string, action: CardsAction) {
    if (action.type === 'sit') return this.sit(playerId);
    if (action.type === 'leave') return this.leave(playerId);
    const at = this.places.get(playerId);
    if (!at) return;
    const { table, seat } = at;
    const error =
      action.type === 'play'
        ? play(table.round, seat, action.card, action.colour, ALL, this.rnd)
        : action.type === 'draw'
          ? draw(table.round, seat, ALL, this.rnd)
          : pass(table.round, seat, ALL);
    // A refused move means the phone is behind: show it the table as it is.
    if (error) this.host.send(playerId, this.view(at));
    else this.changed(table);
  }

  /** Called when the game moves on: anyone who now has something to do leaves their table. */
  sync() {
    for (const playerId of [...this.places.keys()]) {
      if (!this.host.eligible(playerId)) this.leave(playerId);
    }
  }

  /** The player's last phone has gone. */
  drop(playerId: string) {
    this.leave(playerId);
  }

  /** A new game starts with no tables and no hands. */
  reset() {
    for (const table of this.tables) clearTimeout(table.timer);
    const seated = [...this.places.keys()];
    this.tables = [];
    this.places.clear();
    this.kept.clear();
    for (const playerId of seated) this.host.send(playerId, null);
  }

  /** For tests: where a player is, and the hand that is theirs whether they are at a table or not. */
  peek(playerId: string) {
    const at = this.places.get(playerId);
    if (!at) return { table: null, seat: null, hand: this.kept.get(playerId) ?? null };
    return { table: this.tables.indexOf(at.table), seat: at.seat, hand: at.table.round.hands[at.seat] as Card[] };
  }

  tableCount() {
    return this.tables.length;
  }

  private players(table: Table) {
    return table.seats.filter((s) => s !== null).length;
  }

  /** A player takes a bot's seat at the fullest table that has one, bringing their own hand. */
  private sit(playerId: string) {
    if (!this.host.eligible(playerId)) return this.host.send(playerId, null);
    const already = this.places.get(playerId);
    if (already) return this.host.send(playerId, this.view(already));

    const table =
      this.tables.filter((t) => this.players(t) < SEATS).sort((a, b) => this.players(b) - this.players(a))[0] ??
      this.open();
    const free = table.seats.flatMap((s, i) => (s === null ? [i] : []));
    const seat = free[Math.floor(this.rnd() * free.length)] as number;
    const r = table.round;
    // The bot's cards go back under the deck.
    r.deck.unshift(...(r.hands[seat] as Card[]));
    const own = this.kept.get(playerId);
    this.kept.delete(playerId);
    r.hands[seat] = own?.length ? own : [];
    if (!own?.length) take(r, seat, HAND_SIZE, this.rnd);
    table.seats[seat] = playerId;
    this.places.set(playerId, { table, seat });
    if (r.turn === seat) r.drew = null;
    // A table already in play keeps its clock, unless the turn in progress is now this player's.
    if (!table.timer || r.turn === seat) this.arm(table);
    this.broadcast(table);
  }

  private open(): Table {
    const table: Table = {
      seats: Array.from({ length: SEATS }, () => null),
      round: deal(SEATS, this.rnd, this.opened * ID_BLOCK),
      timer: undefined,
      deadline: null,
    };
    this.opened += 1;
    this.tables.push(table);
    return table;
  }

  /** The player goes, and their hand with them. A bot sits down with a new hand; an empty table closes. */
  private leave(playerId: string) {
    const at = this.places.get(playerId);
    if (!at) return;
    const { table, seat } = at;
    const r = table.round;
    this.places.delete(playerId);
    this.kept.set(playerId, r.hands[seat] as Card[]);
    this.host.send(playerId, null);
    table.seats[seat] = null;
    if (!this.players(table)) {
      clearTimeout(table.timer);
      this.tables.splice(this.tables.indexOf(table), 1);
      return;
    }
    r.hands[seat] = [];
    take(r, seat, HAND_SIZE, this.rnd);
    if (r.turn === seat) {
      r.drew = null;
      this.arm(table);
    }
    this.broadcast(table);
  }

  private changed(table: Table) {
    this.arm(table);
    this.broadcast(table);
  }

  /** Sets the one timer a table has: the bot's pause, a player's turn clock, or the gap between rounds. */
  private arm(table: Table) {
    clearTimeout(table.timer);
    table.deadline = null;
    const r = table.round;
    const { turnMs, roundGapMs } = this.timing;
    if (r.winner !== null) {
      table.timer = this.after(roundGapMs, () => {
        table.round = deal(SEATS, this.rnd, r.nextId);
        this.changed(table);
      });
      return;
    }
    const seat = r.turn;
    const sitter = table.seats[seat] as string | null;
    if (sitter === null) {
      table.timer = this.after(this.botPause(r.hands[seat] as Card[], r), () => {
        if (table.round.turn === seat && table.seats[seat] === null) this.botTurn(table, seat);
        this.changed(table);
      });
    } else {
      table.deadline = this.now() + turnMs;
      // Out of time: the player is taken to be away, and a bot takes the seat and the turn.
      table.timer = this.after(turnMs, () => this.leave(sitter));
    }
  }

  /**
   * How long a bot takes over a turn. Quick when it has one card to play, slower with a choice or nothing to play,
   * and about one turn in five it stops to think.
   */
  private botPause(hand: readonly Card[], r: Round) {
    const { botMinMs, botMaxMs, botThinkMs } = this.timing;
    const options = hand.filter((c) => canPlay(c, topCard(r), r.colour)).length;
    const span = (botMaxMs - botMinMs) * (options === 1 ? 0.5 : 1);
    const think = this.rnd() < 0.2 ? this.rnd() * botThinkMs : 0;
    return botMinMs + this.rnd() * span + think;
  }

  private after(ms: number, run: () => void) {
    const timer = setTimeout(run, ms);
    timer.unref();
    return timer;
  }

  private botTurn(table: Table, seat: number) {
    const r = table.round;
    const hand = r.hands[seat] as Card[];
    const move = chooseMove(hand, topCard(r), r.colour);
    if (move) {
      play(r, seat, move.card.id, move.colour, ALL, this.rnd);
      return;
    }
    draw(r, seat, ALL, this.rnd);
    // Still its turn: the drawn card can be played, so it is.
    const drawn = hand.find((c) => c.id === r.drew);
    if (r.turn === seat && drawn) play(r, seat, drawn.id, bestColour(hand), ALL, this.rnd);
  }

  private broadcast(table: Table) {
    table.seats.forEach((playerId, seat) => {
      if (playerId !== null) this.host.send(playerId, this.view({ table, seat }));
    });
  }

  /** Says who the last skip or draw card landed on, so a +2 on the pile is not taken for one's own. */
  private note(r: Round, seat: number): string | null {
    if (!r.hit || r.winner !== null) return null;
    const { drew } = r.hit;
    if (r.hit.seat === seat) return drew ? `You drew ${drew} and missed a turn.` : 'You were skipped.';
    return drew ? `Another seat drew ${drew} and missed a turn.` : 'Another seat was skipped.';
  }

  private view({ table, seat }: Place): CardsView {
    const r = table.round;
    const myTurn = r.winner === null && r.turn === seat;
    const ok = new Set(myTurn ? playable(r, seat).map((c) => c.id) : []);
    const hand = [...(r.hands[seat] as Card[])].sort((a, b) => order(a) - order(b));
    return {
      serverNow: this.now(),
      seats: table.seats.map((_, i) => {
        const j = (seat + i) % SEATS;
        return { count: (r.hands[j] as Card[]).length, turn: r.winner === null && r.turn === j };
      }),
      direction: r.dir,
      top: topCard(r),
      colour: r.colour,
      hand: hand.map((c) => ({ ...c, playable: ok.has(c.id) })),
      myTurn,
      canDraw: myTurn && r.drew === null,
      canPass: myTurn && r.drew !== null,
      deadline: myTurn ? table.deadline : null,
      result: r.winner === null ? null : r.winner === seat ? 'won' : 'lost',
      note: this.note(r, seat),
    };
  }
}
