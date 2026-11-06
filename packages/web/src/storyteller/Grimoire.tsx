import { useState } from 'react';
import type { GrimoirePlayer, RoleId, StorytellerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Button, HoldButton } from '../ui/ui';
import { Lines, Section, useSeats } from './common';
import styles from './console.module.css';

const CONDITIONS = ['drunk', 'poisoned', 'mad'] as const;

function Seat({ view, p }: { view: StorytellerView; p: GrimoirePlayer }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const [adding, setAdding] = useState<(typeof CONDITIONS)[number]>('poisoned');
  const believes = p.self.character && p.self.character !== p.character ? names.roles[p.self.character] : null;
  return (
    <article className={p.alive ? styles['seat'] : `${styles['seat']} ${styles['seatDead']}`}>
      <h3>
        {p.name}
        {p.alive ? '' : ' (dead)'}
      </h3>
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
  const ended = view.phase.kind === 'ended';
  return (
    <div>
      <Section title="The circle">
        <div className={styles['circle']}>
          {seated.map((p) => (
            <Seat key={p.id} view={view} p={p} />
          ))}
        </div>
        {!seated.length && <p className="muted">Nobody is seated.</p>}
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
