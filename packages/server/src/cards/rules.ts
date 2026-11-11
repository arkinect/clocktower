// Crazy 8s with coloured cards: the rules and the bot, as plain functions. No clock and no sockets here; the caller
// passes the random source and says which seats are playing.
import type { Card, CardColour, CardFace } from '@ct/protocol';

export type Rnd = () => number;

export const COLOURS: readonly CardColour[] = ['red', 'yellow', 'green', 'blue'];
export const HAND_SIZE = 7;

const NUMBERS: readonly CardFace[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ACTIONS: readonly CardFace[] = ['skip', 'reverse', 'draw2'];

export const DECK_SIZE = 108;

/**
 * 108 cards: per colour one 0 and two of everything else, then four of each wild. Ids count up from `firstId`: hands
 * move between tables with their players, so no two cards anywhere may share one.
 */
export function newDeck(firstId = 0): Card[] {
  const cards: Card[] = [];
  const add = (colour: CardColour | null, face: CardFace) => cards.push({ id: firstId + cards.length, colour, face });
  for (const colour of COLOURS) {
    add(colour, '0');
    for (const face of [...NUMBERS.slice(1), ...ACTIONS]) {
      add(colour, face);
      add(colour, face);
    }
  }
  for (let i = 0; i < 4; i++) {
    add(null, 'wild');
    add(null, 'wild4');
  }
  return cards;
}

export function shuffle<T>(items: T[], rnd: Rnd): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j] as T, items[i] as T];
  }
  return items;
}

export interface Round {
  deck: Card[];
  discard: Card[];
  colour: CardColour;
  hands: Card[][];
  turn: number;
  dir: 1 | -1;
  /** The card the seat on turn has just drawn: it may play that card or pass. */
  drew: number | null;
  winner: number | null;
  /** The first id of the next deck this table opens. */
  nextId: number;
  /** The last card that cost a seat its turn, until that seat next acts: who lost the turn, and what they drew. */
  hit: { seat: number; drew: number } | null;
}

export function deal(seats: number, rnd: Rnd, firstId = 0): Round {
  const deck = shuffle(newDeck(firstId), rnd);
  const hands = Array.from({ length: seats }, () => deck.splice(0, HAND_SIZE));
  // The first card up is always a number, so no seat starts skipped or drawing.
  const first = deck.splice(
    deck.findIndex((c) => NUMBERS.includes(c.face)),
    1,
  )[0] as Card;
  return {
    deck,
    discard: [first],
    colour: first.colour as CardColour,
    hands,
    turn: Math.floor(rnd() * seats),
    dir: 1,
    drew: null,
    winner: null,
    nextId: firstId + DECK_SIZE,
    hit: null,
  };
}

export const topCard = (r: Round) => r.discard[r.discard.length - 1] as Card;

export function canPlay(card: Card, top: Card, colour: CardColour) {
  return card.colour === null || card.colour === colour || card.face === top.face;
}

/** What a seat may play now. After drawing, only the drawn card. */
export function playable(r: Round, seat: number): Card[] {
  const ok = (r.hands[seat] ?? []).filter((c) => canPlay(c, topCard(r), r.colour));
  return r.drew === null ? ok : ok.filter((c) => c.id === r.drew);
}

/** The seat `steps` playing seats on from `from`. Seats not playing are passed over. */
export function nextSeat(r: Round, active: readonly boolean[], from = r.turn, steps = 1) {
  const n = r.hands.length;
  let seat = from;
  for (let k = 0; k < steps; k++) {
    for (let i = 0; i < n; i++) {
      seat = (seat + r.dir + n) % n;
      if (active[seat]) break;
    }
  }
  return seat;
}

export function advance(r: Round, active: readonly boolean[], steps = 1) {
  if (r.hit?.seat === r.turn) r.hit = null;
  r.turn = nextSeat(r, active, r.turn, steps);
  r.drew = null;
}

/**
 * Deals from the deck, turning the discard pile over when the deck runs out. Players carry their hands away with
 * them, so a table can run out of both: it then opens a new deck.
 */
export function take(r: Round, seat: number, n: number, rnd: Rnd): Card | null {
  let last: Card | null = null;
  for (let i = 0; i < n; i++) {
    if (!r.deck.length) {
      const top = r.discard.pop() as Card;
      r.deck = shuffle(r.discard, rnd);
      r.discard = [top];
    }
    if (!r.deck.length) {
      r.deck = shuffle(newDeck(r.nextId), rnd);
      r.nextId += DECK_SIZE;
    }
    const card = r.deck.pop() as Card;
    (r.hands[seat] as Card[]).push(card);
    last = card;
  }
  return last;
}

function onTurn(r: Round, seat: number): string | null {
  if (r.winner !== null) return 'The round is over.';
  if (seat !== r.turn) return 'It is not your turn.';
  return null;
}

/** Each of these returns an error, or null when the move was made. */
export function play(
  r: Round,
  seat: number,
  cardId: number,
  colour: CardColour | undefined,
  active: readonly boolean[],
  rnd: Rnd,
): string | null {
  const refused = onTurn(r, seat);
  if (refused) return refused;
  const card = playable(r, seat).find((c) => c.id === cardId);
  if (!card) return 'You cannot play that card.';
  if (card.colour === null && !colour) return 'Pick a colour.';
  const hand = r.hands[seat] as Card[];
  hand.splice(hand.indexOf(card), 1);
  r.discard.push(card);
  r.colour = card.colour ?? (colour as CardColour);
  if (!hand.length) {
    r.winner = seat;
    r.drew = null;
    return null;
  }
  let steps = 1;
  r.hit = null;
  if (card.face === 'skip') {
    steps = 2;
    r.hit = { seat: nextSeat(r, active), drew: 0 };
  }
  if (card.face === 'reverse') {
    r.dir = r.dir === 1 ? -1 : 1;
    // With two playing, turning round hands the turn straight back.
    if (active.filter(Boolean).length === 2) steps = 2;
  }
  if (card.face === 'draw2' || card.face === 'wild4') {
    const victim = nextSeat(r, active);
    const n = card.face === 'draw2' ? 2 : 4;
    if (victim !== seat) {
      take(r, victim, n, rnd);
      r.hit = { seat: victim, drew: n };
    }
    steps = 2;
  }
  advance(r, active, steps);
  return null;
}

/** Draws one card. A card that cannot be played ends the turn at once. */
export function draw(r: Round, seat: number, active: readonly boolean[], rnd: Rnd): string | null {
  const refused = onTurn(r, seat);
  if (refused) return refused;
  if (r.drew !== null) return 'You have already drawn.';
  const card = take(r, seat, 1, rnd);
  if (card && canPlay(card, topCard(r), r.colour)) r.drew = card.id;
  else advance(r, active);
  return null;
}

export function pass(r: Round, seat: number, active: readonly boolean[]): string | null {
  const refused = onTurn(r, seat);
  if (refused) return refused;
  if (r.drew === null) return 'Draw a card first.';
  advance(r, active);
  return null;
}

// ---- The bot ----

/** The colour a hand holds most of. */
export function bestColour(hand: readonly Card[]): CardColour {
  let best: CardColour = 'red';
  let most = -1;
  for (const colour of COLOURS) {
    const n = hand.filter((c) => c.colour === colour).length;
    if (n > most) [best, most] = [colour, n];
  }
  return best;
}

export interface Move {
  card: Card;
  colour?: CardColour;
}

/** Picks a card to play, or null to draw. Coloured cards go first, action cards before numbers; wilds are kept. */
export function chooseMove(hand: readonly Card[], top: Card, colour: CardColour): Move | null {
  const options = hand.filter((c) => canPlay(c, top, colour));
  const rank = (c: Card) => (c.colour === null ? 2 : ACTIONS.includes(c.face) ? 0 : 1);
  const card = [...options].sort((a, b) => rank(a) - rank(b))[0];
  if (!card) return null;
  if (card.colour !== null) return { card };
  return { card, colour: bestColour(hand.filter((c) => c !== card)) };
}
