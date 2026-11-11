import { afterEach, describe, expect, it } from 'vitest';
import type { Card, CardsView } from '@ct/protocol';
import {
  HAND_SIZE,
  advance,
  canPlay,
  chooseMove,
  deal,
  draw,
  newDeck,
  pass,
  play,
  playable,
  topCard,
  type Round,
} from '../src/cards/rules';
import { SEATS, Tables, type CardsTiming } from '../src/cards/tables';
import { firstChoices, start, table, type Client, type Harness } from './helpers/client';

/** A repeatable random source. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

const ALL = [true, true, true, true];
const card = (face: Card['face'], colour: Card['colour'], id = 0): Card => ({ id, colour, face });

/** A round with chosen hands and top card, seat 0 to play. */
function round(hands: Card[][], top: Card, deck: Card[] = []): Round {
  return {
    deck,
    discard: [top],
    colour: top.colour ?? 'red',
    hands,
    turn: 0,
    dir: 1,
    drew: null,
    winner: null,
    nextId: 1000,
    hit: null,
  };
}

const cardsIn = (r: Round) => [...r.deck, ...r.discard, ...r.hands.flat()].map((c) => c.id).sort((a, b) => a - b);

describe('the Crazy 8s rules', () => {
  it('has 108 different cards and deals seven to each seat with a number up', () => {
    const deck = newDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
    expect(deck.filter((c) => c.colour === null)).toHaveLength(8);
    const r = deal(4, seeded(1));
    expect(r.hands.map((h) => h.length)).toEqual([HAND_SIZE, HAND_SIZE, HAND_SIZE, HAND_SIZE]);
    expect(/^\d$/.test(topCard(r).face)).toBe(true);
    expect(cardsIn(r)).toHaveLength(108);
  });

  it('lets a card follow by colour or by face, and a wild follow anything', () => {
    const top = card('5', 'red');
    expect(canPlay(card('9', 'red'), top, 'red')).toBe(true);
    expect(canPlay(card('5', 'blue'), top, 'red')).toBe(true);
    expect(canPlay(card('9', 'blue'), top, 'red')).toBe(false);
    expect(canPlay(card('wild', null), top, 'red')).toBe(true);
    // After a wild, the named colour is what counts.
    expect(canPlay(card('9', 'green'), card('wild', null), 'green')).toBe(true);
    expect(canPlay(card('9', 'red'), card('wild', null), 'green')).toBe(false);
  });

  it('refuses a move out of turn, a card that does not follow, and a wild with no colour', () => {
    const r = round(
      [[card('9', 'blue', 1), card('wild', null, 2), card('3', 'red', 3)], [card('1', 'red', 4)], [], []],
      card('5', 'red', 9),
    );
    expect(play(r, 1, 4, undefined, ALL, Math.random)).toBe('It is not your turn.');
    expect(play(r, 0, 1, undefined, ALL, Math.random)).toBe('You cannot play that card.');
    expect(play(r, 0, 2, undefined, ALL, Math.random)).toBe('Pick a colour.');
    expect(play(r, 0, 2, 'green', ALL, Math.random)).toBeNull();
    expect(r.colour).toBe('green');
    expect(r.turn).toBe(1);
  });

  it('skips, reverses and makes the next seat draw', () => {
    const filler = () => [card('1', 'green', 50), card('2', 'green', 51)];
    let r = round([[card('skip', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9));
    play(r, 0, 1, undefined, ALL, Math.random);
    expect(r.turn).toBe(2);

    r = round([[card('reverse', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9));
    play(r, 0, 1, undefined, ALL, Math.random);
    expect([r.dir, r.turn]).toEqual([-1, 3]);

    const deck = [card('7', 'blue', 20), card('8', 'blue', 21), card('9', 'blue', 22)];
    r = round([[card('draw2', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9), deck);
    play(r, 0, 1, undefined, ALL, Math.random);
    expect(r.hands[1]).toHaveLength(4);
    expect(r.turn).toBe(2);
    expect(r.hit).toEqual({ seat: 1, drew: 2 });
  });

  it('passes over a seat that is away, and never deals it cards', () => {
    const filler = () => [card('1', 'green', 50), card('2', 'green', 51)];
    const active = [true, false, true, true];
    const deck = [card('7', 'blue', 20), card('8', 'blue', 21), card('9', 'blue', 22)];
    const r = round([[card('draw2', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9), deck);
    play(r, 0, 1, undefined, active, Math.random);
    expect(r.hands[1]).toHaveLength(2);
    expect(r.hands[2]).toHaveLength(4);
    expect(r.turn).toBe(3);
  });

  it('with two playing, a reverse hands the turn straight back', () => {
    const filler = () => [card('1', 'green', 50), card('2', 'green', 51)];
    const r = round([[card('reverse', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9));
    play(r, 0, 1, undefined, [true, false, true, false], Math.random);
    expect(r.turn).toBe(0);
  });

  it('ends the turn on a drawn card that cannot be played, and offers one that can', () => {
    let r = round([[card('1', 'green', 1)], [card('1', 'green', 2)], [], []], card('5', 'red', 9), [
      card('7', 'blue', 20),
    ]);
    expect(draw(r, 0, ALL, Math.random)).toBeNull();
    expect(r.turn).toBe(1);
    expect(r.hands[0]).toHaveLength(2);

    r = round([[card('1', 'green', 1), card('5', 'green', 3)], [card('1', 'green', 2)], [], []], card('5', 'red', 9), [
      card('7', 'red', 20),
    ]);
    expect(pass(r, 0, ALL)).toBe('Draw a card first.');
    draw(r, 0, ALL, Math.random);
    expect(r.turn).toBe(0);
    // Only the drawn card may be played now, though another card would have followed.
    expect(playable(r, 0).map((c) => c.id)).toEqual([20]);
    expect(draw(r, 0, ALL, Math.random)).toBe('You have already drawn.');
    expect(pass(r, 0, ALL)).toBeNull();
    expect(r.turn).toBe(1);
  });

  it('turns the discard pile over when the deck runs out', () => {
    const r = round([[card('1', 'green', 1)], [card('1', 'green', 2)], [], []], card('5', 'red', 9));
    r.discard.unshift(card('2', 'blue', 30), card('3', 'blue', 31));
    draw(r, 0, ALL, seeded(3));
    expect(r.hands[0]).toHaveLength(2);
    expect(r.discard.map((c) => c.id)).toEqual([9]);
    expect(r.deck).toHaveLength(1);
  });

  it('gives the round to the seat that plays its last card', () => {
    const r = round([[card('9', 'red', 1)], [card('1', 'green', 2)], [], []], card('5', 'red', 9));
    play(r, 0, 1, undefined, ALL, Math.random);
    expect(r.winner).toBe(0);
    expect(play(r, 1, 2, undefined, ALL, Math.random)).toBe('The round is over.');
  });
});

describe('the bot', () => {
  it('plays a coloured card before a wild, and draws when nothing follows', () => {
    const top = card('5', 'red', 9);
    const hand = [card('wild', null, 1), card('7', 'red', 2), card('3', 'blue', 3)];
    expect(chooseMove(hand, top, 'red')?.card.id).toBe(2);
    expect(chooseMove([card('3', 'blue', 3)], top, 'red')).toBeNull();
  });

  it('names the colour it holds most of when it plays a wild', () => {
    const hand = [card('wild', null, 1), card('3', 'blue', 3), card('4', 'blue', 4), card('4', 'green', 5)];
    expect(chooseMove(hand, card('5', 'red', 9), 'red')).toEqual({ card: hand[0], colour: 'blue' });
  });

  it('can play whole rounds against itself without losing a card, every +2 and +4 landing on the next seat', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rnd = seeded(seed);
      const r = deal(4, rnd);
      for (let turns = 0; r.winner === null && turns < 5000; turns++) {
        const seat = r.turn;
        const hand = r.hands[seat] as Card[];
        const move = chooseMove(hand, topCard(r), r.colour);
        if (move) {
          const next = (seat + (move.card.face === 'reverse' ? -r.dir : r.dir) + 4) % 4;
          const held = (r.hands[next] as Card[]).length;
          expect(play(r, seat, move.card.id, move.colour, ALL, rnd)).toBeNull();
          const owed = move.card.face === 'draw2' ? 2 : move.card.face === 'wild4' ? 4 : 0;
          if (r.winner === null) {
            expect((r.hands[next] as Card[]).length).toBe(held + owed);
            // The seat that drew does not get the turn.
            if (owed) expect(r.turn).not.toBe(next);
          }
        } else {
          draw(r, seat, ALL, rnd);
          if (r.turn === seat && r.drew !== null) advance(r, ALL);
        }
        expect(cardsIn(r)).toHaveLength(108);
      }
      expect(r.winner).not.toBeNull();
    }
  });
});

// ---- Tables ----

const QUICK: CardsTiming = { turnMs: 150, botMinMs: 1, botMaxMs: 3, botThinkMs: 4, roundGapMs: 5 };
const SLOW_BOTS: CardsTiming = {
  turnMs: 60_000,
  botMinMs: 60_000,
  botMaxMs: 60_000,
  botThinkMs: 0,
  roundGapMs: 60_000,
};

function room(timing: CardsTiming, seed = 7) {
  const busy = new Set<string>();
  const seen = new Map<string, CardsView | null>();
  const tables = new Tables(
    { eligible: (id) => !busy.has(id), send: (id, table) => seen.set(id, table) },
    timing,
    seeded(seed),
  );
  const view = (id: string) => seen.get(id) as CardsView;
  return { busy, seen, tables, view };
}

async function until(check: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
}

const ids = (cards: readonly Card[] | null | undefined) => (cards ?? []).map((c) => c.id).sort((a, b) => a - b);

/** Plays the first card allowed, or draws, or passes. */
function move(tables: Tables, id: string, v: CardsView) {
  const first = v.hand.find((c) => c.playable);
  if (first) tables.handle(id, { type: 'play', card: first.id, ...(first.colour ? {} : { colour: 'red' }) });
  else if (v.canDraw) tables.handle(id, { type: 'draw' });
  else tables.handle(id, { type: 'pass' });
}

describe('the card tables', () => {
  it('seats a lone player with three bots, showing only their own hand', () => {
    const { tables, view } = room(SLOW_BOTS);
    tables.handle('ann', { type: 'sit' });
    const v = view('ann');
    expect(v.seats).toHaveLength(SEATS);
    expect(v.seats.map((s) => s.count)).toEqual([7, 7, 7, 7]);
    expect(ids(v.hand)).toEqual(ids(tables.peek('ann').hand));
    tables.reset();
  });

  it('fills a table before opening another', () => {
    const { tables } = room(SLOW_BOTS);
    const names = ['ann', 'bo', 'cy', 'di', 'ed'];
    for (const n of names) tables.handle(n, { type: 'sit' });
    const at = names.map((n) => tables.peek(n));
    expect(at.slice(0, 4).map((p) => p.table)).toEqual([0, 0, 0, 0]);
    expect(new Set(at.slice(0, 4).map((p) => p.seat)).size).toBe(4);
    expect(at[4]?.table).toBe(1);
    expect(tables.tableCount()).toBe(2);
    tables.reset();
  });

  it('refuses a seat to a player who still has something to do', () => {
    const { busy, seen, tables } = room(SLOW_BOTS);
    busy.add('ann');
    tables.handle('ann', { type: 'sit' });
    expect(seen.get('ann')).toBeNull();
    expect(tables.tableCount()).toBe(0);
  });

  it('lets a player take their hand away and bring it back, a bot sitting in with a hand of its own', () => {
    const { seen, tables, view } = room(SLOW_BOTS);
    tables.handle('ann', { type: 'sit' });
    tables.handle('bo', { type: 'sit' });
    const hers = ids(tables.peek('ann').hand);
    tables.handle('ann', { type: 'leave' });
    expect(seen.get('ann')).toBeNull();
    expect(ids(tables.peek('ann').hand)).toEqual(hers);
    // Bo still sees four seats of seven cards, and none of the cards at the table is one of Ann's.
    expect(view('bo').seats.map((s) => s.count)).toEqual([7, 7, 7, 7]);
    tables.handle('ann', { type: 'sit' });
    expect(ids(view('ann').hand)).toEqual(hers);
    expect(tables.peek('ann').table).toBe(0);
    tables.reset();
  });

  it('brings a returning player to the fullest table, and closes a table nobody is at', () => {
    const { tables, view } = room(SLOW_BOTS);
    const names = ['ann', 'bo', 'cy', 'di', 'ed'];
    for (const n of names) tables.handle(n, { type: 'sit' });
    const eds = ids(tables.peek('ed').hand);
    // Ed has a table to himself. He and Ann both step away; his table closes.
    tables.handle('ed', { type: 'leave' });
    tables.handle('ann', { type: 'leave' });
    expect(tables.tableCount()).toBe(1);
    // Ed comes back first and takes the seat at the busy table, with the hand he was dealt at the other one.
    tables.handle('ed', { type: 'sit' });
    expect(tables.tableCount()).toBe(1);
    expect(tables.peek('ed').table).toBe(0);
    expect(ids(view('ed').hand)).toEqual(eds);
    // No two cards anywhere share an id, though they come from two decks.
    const held = ['bo', 'cy', 'di', 'ed', 'ann'].flatMap((n) => ids(tables.peek(n).hand));
    expect(new Set(held).size).toBe(held.length);
    tables.reset();
  });

  it('takes a player who idles through their turn to be away', async () => {
    const { seen, tables } = room(QUICK);
    tables.handle('ann', { type: 'sit' });
    const dealt = ids(tables.peek('ann').hand).length;
    await until(() => seen.get('ann') === null);
    // Her hand is kept, with whatever the bots made her draw, and the table she was alone at has closed.
    expect(ids(tables.peek('ann').hand).length >= dealt).toBe(true);
    expect(tables.tableCount()).toBe(0);
  });

  it('never has a bot play from a hand that belongs to a player', async () => {
    const { tables, view } = room({ ...QUICK, turnMs: 60_000 });
    tables.handle('ann', { type: 'sit' });
    tables.handle('bo', { type: 'sit' });
    tables.handle('ann', { type: 'leave' });
    const hers = ids(tables.peek('ann').hand);
    for (let turns = 0; turns < 8; turns++) {
      await until(() => view('bo').myTurn || view('bo').result !== null);
      if (view('bo').result) break;
      const v = view('bo');
      move(tables, 'bo', v);
      await until(() => view('bo') !== v);
    }
    expect(ids(tables.peek('ann').hand)).toEqual(hers);
    tables.reset();
  });

  it('deals a new round after one is won', async () => {
    const { tables, view } = room({ ...QUICK, turnMs: 60_000 }, 11);
    tables.handle('ann', { type: 'sit' });
    let rounds = 0;
    let last: CardsView['result'] = null;
    for (let turns = 0; rounds < 1 && turns < 2000; turns++) {
      await until(() => view('ann').myTurn || view('ann').result !== last);
      const v = view('ann');
      if (v.result !== last) {
        if (last !== null && v.result === null) rounds += 1;
        last = v.result;
        continue;
      }
      move(tables, 'ann', v);
    }
    expect(rounds).toBe(1);
    expect(
      view('ann')
        .seats.map((s) => s.count)
        .every((n) => n > 0),
    ).toBe(true);
    tables.reset();
  });

  it('opens a new deck when players have carried the old one away', () => {
    const { tables } = room(SLOW_BOTS);
    tables.handle('ann', { type: 'sit' });
    // Each visitor is dealt seven cards and walks off with them.
    for (let i = 0; i < 40; i++) {
      tables.handle(`p${i}`, { type: 'sit' });
      tables.handle(`p${i}`, { type: 'leave' });
    }
    tables.handle('bo', { type: 'sit' });
    expect(tables.peek('bo').hand).toHaveLength(7);
    tables.reset();
  });

  it('clears every table and hand when the game starts again', () => {
    const { seen, tables } = room(SLOW_BOTS);
    tables.handle('ann', { type: 'sit' });
    tables.handle('bo', { type: 'sit' });
    tables.handle('bo', { type: 'leave' });
    tables.reset();
    expect(seen.get('ann')).toBeNull();
    expect(tables.peek('bo').hand).toBeNull();
    expect(tables.tableCount()).toBe(0);
  });
});

// ---- Over sockets ----

const opened: Harness[] = [];
afterEach(async () => {
  for (const h of opened.splice(0)) await h.app.close();
});

describe('the card table over sockets', () => {
  it('opens once a player has finished their night, keeps their hand while away, and closes at dawn', async () => {
    const h = await start();
    opened.push(h);
    const { st, players } = await table(h);
    const [ann, bo] = players as [Client, Client];
    const game = h.app.games.get('default')!;

    await st.do({ type: 'begin_first_night', force: true });
    await ann.until((v) => v.phase.kind === 'night');
    // Still being briefed: no seat.
    ann.play({ type: 'sit' });
    expect(await ann.untilCards(() => true)).toBeNull();

    await st.do({ type: 'open_collecting' });
    for (const p of [ann, bo]) {
      const view = await p.until((v) => v.phase.stage === 'collecting');
      // Not submitted yet: still no seat.
      p.play({ type: 'sit' });
      expect(await p.untilCards(() => true)).toBeNull();
      if (view.kind === 'player') await p.do({ type: 'submit_night', actions: firstChoices(view) });
      p.play({ type: 'sit' });
      await p.untilCards((t) => t !== null);
    }
    expect(ann.cards?.seats).toHaveLength(4);
    expect(game.cards.peek(ann.id).table).toBe(game.cards.peek(bo.id).table);
    expect(game.cards.peek(ann.id).seat).not.toBe(game.cards.peek(bo.id).seat);
    // Another seat is a count of cards and whose turn it is, nothing more.
    expect(Object.keys(ann.cards?.seats[1] ?? {}).sort()).toEqual(['count', 'turn']);

    // Leaving and coming back: the same cards.
    ann.play({ type: 'leave' });
    await ann.untilCards((t) => t === null);
    const kept = ids(game.cards.peek(ann.id).hand);
    ann.play({ type: 'sit' });
    const back = await ann.untilCards((t) => t !== null);
    expect(ids(back?.hand)).toEqual(kept);

    // No card move reaches the command log.
    const before = game.logLength;
    ann.play({ type: 'draw' });
    ann.play({ type: 'leave' });
    await ann.untilCards((t) => t === null);
    expect(game.logLength).toBe(before);
    ann.play({ type: 'sit' });
    await ann.untilCards((t) => t !== null);

    await st.do({ type: 'close_collecting', force: true });
    await st.until((v) => v.phase.stage === 'review');
    await st.do({ type: 'accept_all_defaults' });
    await st.do({ type: 'publish_dawn', force: true });
    // Dawn: the table is gone, and asking for a seat gets none.
    await ann.untilCards((t) => t === null);
    ann.cards = undefined;
    ann.play({ type: 'sit' });
    expect(await ann.untilCards(() => true)).toBeNull();
  });
});
