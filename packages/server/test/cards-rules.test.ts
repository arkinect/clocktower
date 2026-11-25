// The rules of the card game and the bot that plays them.
import { describe, expect, it } from 'vitest';
import type { Card } from '@ct/protocol';
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
import { seeded } from './helpers/seeded';

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
    owed: 0,
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

  it('skips, reverses, and makes the next seat draw', () => {
    const filler = () => [card('1', 'green', 50), card('2', 'green', 51)];
    let r = round([[card('skip', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9));
    play(r, 0, 1, undefined, ALL, Math.random);
    expect(r.turn).toBe(2);

    r = round([[card('reverse', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9));
    play(r, 0, 1, undefined, ALL, Math.random);
    expect([r.dir, r.turn]).toEqual([-1, 3]);

    // A +4 makes the next seat draw four and costs it the turn.
    const deck = () => [card('6', 'blue', 20), card('7', 'blue', 21), card('8', 'blue', 22), card('9', 'blue', 23)];
    r = round([[card('wild4', null, 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9), deck());
    play(r, 0, 1, 'blue', ALL, Math.random);
    expect(r.hands[1]).toHaveLength(6);
    expect(r.turn).toBe(2);
    expect(r.hit).toEqual({ seat: 1, drew: 4, missed: true });

    // A +2 does not: the next seat draws two and then takes its turn.
    r = round([[card('draw2', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9), deck());
    play(r, 0, 1, undefined, ALL, Math.random);
    expect([r.turn, r.owed]).toEqual([1, 2]);
    expect(r.hands[1]).toHaveLength(2);
    expect(draw(r, 1, ALL, Math.random)).toBeNull();
    expect(r.hands[1]).toHaveLength(4);
    expect([r.turn, r.owed, r.drew]).toEqual([1, 0, null]);
    expect(r.hit).toEqual({ seat: 1, drew: 2, missed: false });
    // Its turn goes on as usual: here the blue cards it drew do not follow, so it draws again.
    expect(playable(r, 1)).toEqual([]);
    expect(pass(r, 1, ALL)).toBe('Draw a card first.');
    draw(r, 1, ALL, Math.random);
    expect(r.hands[1]).toHaveLength(5);
    expect(r.turn).toBe(2);
    expect(r.hit).toBeNull();
  });

  it('lets a +2 pass what is owed on to the next seat, two more each time', () => {
    const filler = () => [card('1', 'green', 50), card('2', 'green', 51)];
    const deck = Array.from({ length: 10 }, (_, i) => card('7', 'blue', 20 + i));
    const r = round(
      [
        [card('draw2', 'red', 1), ...filler()],
        [card('draw2', 'yellow', 2), card('5', 'red', 3), ...filler()],
        [card('draw2', 'blue', 4), card('2', 'green', 5)],
        [card('7', 'yellow', 6), ...filler()],
      ],
      card('5', 'red', 9),
      deck,
    );
    play(r, 0, 1, undefined, ALL, Math.random);
    // Owing, only a +2 may be played, of any colour; a card that would otherwise follow may not.
    expect(playable(r, 1).map((c) => c.id)).toEqual([2]);
    expect(play(r, 1, 3, undefined, ALL, Math.random)).toBe('You cannot play that card.');
    expect(play(r, 1, 2, undefined, ALL, Math.random)).toBeNull();
    expect([r.turn, r.owed, r.colour]).toEqual([2, 4, 'yellow']);
    expect(r.hands[1]).toHaveLength(3);
    play(r, 2, 4, undefined, ALL, Math.random);
    expect([r.turn, r.owed]).toEqual([3, 6]);
    // Seat 3 has no +2: it draws all six, then plays on the blue +2.
    expect(playable(r, 3)).toEqual([]);
    draw(r, 3, ALL, Math.random);
    expect(r.hands[3]).toHaveLength(9);
    expect([r.turn, r.owed]).toEqual([3, 0]);
    expect(playable(r, 3).map((c) => c.id)).toEqual([29, 28, 27, 26, 25, 24]);
  });

  it('passes over a seat that is away, and never deals it cards', () => {
    const filler = () => [card('1', 'green', 50), card('2', 'green', 51)];
    const active = [true, false, true, true];
    const deck = [card('7', 'blue', 20), card('8', 'blue', 21), card('9', 'blue', 22)];
    const r = round([[card('draw2', 'red', 1), ...filler()], filler(), filler(), filler()], card('5', 'red', 9), deck);
    play(r, 0, 1, undefined, active, Math.random);
    expect([r.turn, r.owed]).toEqual([2, 2]);
    draw(r, 2, active, Math.random);
    expect(r.hands[1]).toHaveLength(2);
    expect(r.hands[2]).toHaveLength(4);
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

  it('passes what it owes on with a +2 when it has one', () => {
    const top = card('draw2', 'red', 9);
    const hand = [card('7', 'red', 1), card('draw2', 'blue', 2)];
    expect(chooseMove(hand, top, 'red', 2)?.card.id).toBe(2);
    expect(chooseMove([card('7', 'red', 1)], top, 'red', 2)).toBeNull();
  });

  it('names the colour it holds most of when it plays a wild', () => {
    const hand = [card('wild', null, 1), card('3', 'blue', 3), card('4', 'blue', 4), card('4', 'green', 5)];
    expect(chooseMove(hand, card('5', 'red', 9), 'red')).toEqual({ card: hand[0], colour: 'blue' });
  });

  it('can play whole rounds against itself without losing a card, every +2 and +4 landing on the next seat', () => {
    let stacked = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const rnd = seeded(seed);
      const r = deal(4, rnd);
      for (let turns = 0; r.winner === null && turns < 5000; turns++) {
        const seat = r.turn;
        const hand = r.hands[seat] as Card[];
        if (r.owed && !chooseMove(hand, topCard(r), r.colour, r.owed)) {
          // Nothing to pass it on with: it draws what it owes and keeps its turn.
          const [held, owed] = [hand.length, r.owed];
          expect(draw(r, seat, ALL, rnd)).toBeNull();
          expect([hand.length, r.turn, r.owed]).toEqual([held + owed, seat, 0]);
        }
        const owing = r.owed;
        const move = chooseMove(hand, topCard(r), r.colour, r.owed);
        if (move) {
          const next = (seat + (move.card.face === 'reverse' ? -r.dir : r.dir) + 4) % 4;
          const held = (r.hands[next] as Card[]).length;
          expect(play(r, seat, move.card.id, move.colour, ALL, rnd)).toBeNull();
          if (r.winner === null && move.card.face === 'draw2') {
            if (owing) stacked += 1;
            // Nothing is drawn yet: the next seat owes two more and has the turn.
            expect([(r.hands[next] as Card[]).length, r.owed, r.turn]).toEqual([held, owing + 2, next]);
          }
          if (r.winner === null && move.card.face === 'wild4') {
            expect((r.hands[next] as Card[]).length).toBe(held + 4);
            expect(r.turn).not.toBe(next);
          }
        } else {
          draw(r, seat, ALL, rnd);
          if (r.turn === seat && r.drew !== null) advance(r, ALL);
        }
        expect(cardsIn(r)).toHaveLength(108);
      }
      expect(r.winner).not.toBeNull();
    }
    expect(stacked).toBeGreaterThan(0);
  });
});
