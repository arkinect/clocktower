// The card tables: who sits where, when they open and close, and what each phone is sent.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card, CardsView } from '@ct/protocol';
import { SEATS, Tables, type CardsTiming } from '../src/cards/tables';
import { firstChoices, start, table, type Client, type Harness } from './helpers/client';
import { seeded } from './helpers/seeded';

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
    {
      eligible: (id) => !busy.has(id),
      send: (id, table) => seen.set(id, table),
      failed: (e) => {
        throw e;
      },
    },
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
  it('an error in a table timer is reported, not thrown', async () => {
    const failed: unknown[] = [];
    let broken = false;
    const tables = new Tables(
      {
        eligible: () => true,
        send: () => {
          if (broken) throw new Error('broken send');
        },
        failed: (e) => failed.push(e),
      },
      { turnMs: 20, botMinMs: 1, botMaxMs: 2, botThinkMs: 1, roundGapMs: 5 },
    );
    tables.handle('ann', { type: 'sit' });
    broken = true;
    await vi.waitFor(() => expect(failed).toContainEqual(new Error('broken send')));
    broken = false;
    tables.reset();
  });

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
