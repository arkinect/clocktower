// Crazy 8s with coloured cards, against whoever else is waiting. The server runs the table: this file draws what it
// is sent and says which card was tapped. No seat shows who is in it.
import { useEffect, useState } from 'react';
import type { Card, CardColour } from '@ct/protocol';
import { useCards } from '../app/store';

const COLOURS: CardColour[] = ['red', 'yellow', 'green', 'blue'];
const SYMBOL: Partial<Record<Card['face'], string>> = {
  skip: '⊘',
  reverse: '⇄',
  draw2: '+2',
  wild: '★',
  wild4: '+4',
};
const SPOKEN: Partial<Record<Card['face'], string>> = {
  skip: 'skip',
  reverse: 'reverse',
  draw2: 'draw two',
  wild: 'wild',
  wild4: 'wild draw four',
};

const symbol = (card: Card) => SYMBOL[card.face] ?? card.face;
const spoken = (card: Card) => `${card.colour ? `${card.colour} ` : ''}${SPOKEN[card.face] ?? card.face}`;

export function CrazyEights() {
  const { table, status, act } = useCards();
  const [picking, setPicking] = useState<number | null>(null);
  const myTurn = table?.myTurn ?? false;

  // Sitting again, after a reconnect or a spell away, gets the same hand back at whichever table has room.
  useEffect(() => {
    if (status === 'open') act({ type: 'sit' });
  }, [status, act]);
  useEffect(() => () => act({ type: 'leave' }), [act]);
  useEffect(() => {
    if (!myTurn) setPicking(null);
  }, [myTurn]);

  if (!table) {
    return (
      <div className="c8">
        <div className="c8-note">
          <p>You are sitting out. Your hand is waiting for you.</p>
          <button type="button" className="c8-pass" onClick={() => act({ type: 'sit' })}>
            Deal me in
          </button>
        </div>
      </div>
    );
  }

  const tap = (card: Card) => {
    if (card.colour === null) setPicking(card.id);
    else act({ type: 'play', card: card.id });
  };
  const state =
    table.result === 'won'
      ? 'You won the round!'
      : table.result === 'lost'
        ? 'Another seat won the round.'
        : table.canPass
          ? 'Play the card you drew, or pass.'
          : myTurn
            ? 'Your turn.'
            : 'Waiting for the other seats.';

  return (
    <div className="c8">
      <div className="c8-seats">
        {table.seats.slice(1).map((s, i) => (
          <div key={i} className={`c8-seat${s.turn ? ' on' : ''}`} aria-label={`Seat ${i + 2}: ${s.count} cards`}>
            <span className="c8-card c8-back c8-small" aria-hidden="true" />
            <b>{s.count}</b>
          </div>
        ))}
      </div>
      <div
        className="c8-dir"
        aria-label={table.direction === 1 ? 'Play runs left to right' : 'Play runs right to left'}
      >
        {table.direction === 1 ? 'you → → → you' : 'you ← ← ← you'}
      </div>

      <div className="c8-mid">
        <button
          type="button"
          className="c8-card c8-back"
          disabled={!table.canDraw}
          onClick={() => act({ type: 'draw' })}
        >
          Draw
        </button>
        <div className={`c8-card c8-${table.colour}`} aria-label={`Top card: ${table.colour} ${spoken(table.top)}`}>
          {symbol(table.top)}
        </div>
        {table.canPass && (
          <button type="button" className="c8-pass" onClick={() => act({ type: 'pass' })}>
            Pass
          </button>
        )}
      </div>

      <div className="c8-state" role="status">
        {state}
        {table.note && <span className="c8-hit">{table.note}</span>}
      </div>
      <div className="c8-clockbar">
        {table.deadline !== null && (
          <div
            key={table.deadline}
            className="c8-clock"
            style={{ animationDuration: `${Math.max(0, table.deadline - table.serverNow)}ms` }}
          />
        )}
      </div>

      {picking !== null ? (
        <div className="c8-pick">
          <span>Which colour?</span>
          {COLOURS.map((colour) => (
            <button
              key={colour}
              type="button"
              className={`c8-card c8-small c8-${colour}`}
              aria-label={colour}
              onClick={() => {
                act({ type: 'play', card: picking, colour });
                setPicking(null);
              }}
            />
          ))}
          <button type="button" className="c8-pass" onClick={() => setPicking(null)}>
            Back
          </button>
        </div>
      ) : (
        <div className="c8-hand">
          {table.hand.map((card) => (
            <button
              key={card.id}
              type="button"
              className={`c8-card c8-${card.colour ?? 'wild'}${card.playable ? ' c8-ok' : ''}`}
              aria-label={spoken(card)}
              disabled={!card.playable}
              onClick={() => tap(card)}
            >
              {symbol(card)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
