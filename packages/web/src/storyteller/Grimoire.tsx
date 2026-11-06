import { useState } from 'react';
import type { GrimoirePlayer, RoleId, StorytellerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Button, HoldButton, Sheet, SheetActions } from '../ui/ui';
import { seatPlace } from './circle';
import { Lines, Section, phaseText, useSeats } from './common';
import styles from './console.module.css';

const CONDITIONS = ['drunk', 'poisoned', 'mad'] as const;

/** One seat on the circle. Everything the Storyteller can change about a player opens from here. */
function SeatToken({ p, i, n, onOpen }: { p: GrimoirePlayer; i: number; n: number; onOpen: () => void }) {
  const names = useNames();
  const { left, top, size } = seatPlace(i, n);
  const character = p.character ? names.roles[p.character] : 'No character';
  const believes = p.self.character && p.self.character !== p.character ? names.roles[p.self.character] : null;
  const tags = [
    ...(p.impaired ? ['impaired'] : []),
    ...p.conditions.map((c) => c.label),
    ...(p.connected ? [] : ['offline']),
  ];
  const facts = [
    character,
    p.alignment,
    ...(p.alive ? [] : ['dead']),
    ...(believes ? [`thinks ${believes}`] : []),
    ...tags,
  ];
  return (
    <button
      type="button"
      className={`${styles['token']} ${p.alignment === 'evil' ? styles['tokenEvil'] : styles['tokenGood']}`}
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${size}%`,
        height: `${size}%`,
        fontSize: `clamp(9px, ${size / 6}cqw, 16px)`,
      }}
      aria-label={`Seat ${i + 1}: ${p.name}, ${facts.join(', ')}`}
      title={facts.join(', ')}
      onClick={onOpen}
    >
      <span className={p.alive ? styles['tokenName'] : `${styles['tokenName']} ${styles['dead']}`}>
        {i + 1} {p.name}
      </span>
      <span className={styles['tokenLine']}>{character}</span>
      {believes && <span className={`${styles['tokenLine']} muted`}>thinks {believes}</span>}
      {tags.length > 0 && <span className={`${styles['tokenLine']} ${styles['warn']}`}>{tags.join(', ')}</span>}
    </button>
  );
}

function Seat({ view, p }: { view: StorytellerView; p: GrimoirePlayer }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const [adding, setAdding] = useState<(typeof CONDITIONS)[number]>('poisoned');
  const believes = p.self.character && p.self.character !== p.character ? names.roles[p.self.character] : null;
  return (
    <article>
      <p className={p.alignment === 'evil' ? styles['evil'] : styles['good']}>
        {p.character ? names.roles[p.character] : 'No character'}, {p.alignment}
      </p>
      {believes && <p className="muted small">Believes they are the {believes}</p>}
      {p.deathCause && <p className="muted small">Died: {p.deathCause}</p>}
      {p.impaired && <p className={styles['warn']}>Impaired: {p.causes.join(', ')}</p>}
      <label className={styles['inline']}>
        <span>Change character of {p.name}</span>
        <select
          value={p.character ?? ''}
          onChange={(e) =>
            void run({ type: 'assign_character', playerId: p.id, roleId: (e.target.value as RoleId) || null })
          }
        >
          <option value="">No character</option>
          {view.script.map((r) => (
            <option key={r} value={r}>
              {names.roles[r] ?? r}
            </option>
          ))}
        </select>
      </label>
      {p.abilities.length > 0 && (
        <ul className={styles['tags']}>
          {p.abilities.map((a) => (
            <li key={a.id} className={a.active ? undefined : styles['off']}>
              {a.name}
              {a.origin !== 'character' ? ` (${a.origin})` : ''}
              {a.used ? ' (used)' : ''}
              {a.perceivedOnly ? ' (only believed)' : ''}
              {a.summary.length > 0 && <Lines lines={a.summary} />}
            </li>
          ))}
        </ul>
      )}
      <ul className={styles['tags']}>
        {p.conditions.map((c) => (
          <li key={c.id}>
            {c.label}{' '}
            <span className="muted small">
              {c.sourceLabel}, {c.until}
            </span>{' '}
            <Button
              tiny
              aria-label={`Remove ${c.label} from ${p.name}`}
              disabled={pending}
              onClick={() => void run({ type: 'remove_condition', conditionId: c.id })}
            >
              ×
            </Button>
          </li>
        ))}
      </ul>
      <div className="row">
        <select
          aria-label={`Condition to add to ${p.name}`}
          value={adding}
          onChange={(e) => setAdding(e.target.value as typeof adding)}
        >
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button
          tiny
          disabled={pending}
          onClick={() => void run({ type: 'add_condition', target: p.id, condition: adding })}
        >
          Add
        </Button>
      </div>
    </article>
  );
}

export function Grimoire({ view }: { view: StorytellerView }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const { seated } = useSeats(view);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = seated.find((p) => p.id === openId);
  const ended = view.phase.kind === 'ended';
  return (
    <div>
      <Section title="The circle">
        {seated.length > 0 ? (
          <>
            <div className={styles['circle']}>
              <div className={styles['circleCentre']}>
                <b>{phaseText(view)}</b>
                <div>
                  {seated.filter((p) => p.alive).length} / {seated.length} alive
                </div>
                {view.setup.bluffs.length > 0 && (
                  <div className="muted small">
                    Bluffs: {view.setup.bluffs.map((b) => names.roles[b] ?? b).join(', ')}
                  </div>
                )}
              </div>
              {seated.map((p, i) => (
                <SeatToken key={p.id} p={p} i={i} n={seated.length} onOpen={() => setOpenId(p.id)} />
              ))}
            </div>
            <p className="muted small">
              Seat 1 is at the top; seats go clockwise. Border: blue good, red evil. Red name: dead. Tap a seat to
              change it.
            </p>
          </>
        ) : (
          <p className="muted">Nobody is seated.</p>
        )}
        {open && (
          <Sheet title={`${open.name}${open.alive ? '' : ' (dead)'}`} onClose={() => setOpenId(null)}>
            <Seat view={view} p={open} />
            <SheetActions>
              <Button onClick={() => setOpenId(null)}>Close</Button>
            </SheetActions>
          </Sheet>
        )}
      </Section>
      {view.storytellerAbilities.length > 0 && (
        <Section title="Held by the Storyteller">
          <ul className={styles['tags']}>
            {view.storytellerAbilities.map((a) => (
              <li key={a.id}>
                {a.name}
                {a.reminder ? `: ${a.reminder}` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Game">
        <p>Demon bluffs: {view.setup.bluffs.map((b) => names.roles[b] ?? b).join(', ') || 'none'}</p>
        <div className="row">
          {ended ? (
            <Button variant="primary" disabled={pending} onClick={() => void run({ type: 'play_again' })}>
              Play again
            </Button>
          ) : (
            <>
              <HoldButton onConfirm={() => void run({ type: 'end_game', winner: 'good' })}>Good wins</HoldButton>
              <HoldButton onConfirm={() => void run({ type: 'end_game', winner: 'evil' })}>Evil wins</HoldButton>
              <HoldButton onConfirm={() => void run({ type: 'end_game', winner: null })}>End with no winner</HoldButton>
            </>
          )}
        </div>
        <details>
          <summary>Force a phase</summary>
          <p className="muted small">For getting out of a stuck game. Nothing resolves on the way.</p>
          <div className="row">
            {(['lobby', 'setup', 'day', 'ended'] as const).map((phase) => (
              <HoldButton key={phase} onConfirm={() => void run({ type: 'force_phase', phase })}>
                {phase}
              </HoldButton>
            ))}
          </div>
        </details>
      </Section>
    </div>
  );
}
