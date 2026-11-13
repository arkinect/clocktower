import { useState } from 'react';
import type { GrimoirePlayer, RoleId, SetupFieldSpec, StorytellerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Button, HoldButton, Segments, Sheet, SheetActions } from '../ui/ui';
import { seatPlace } from './circle';
import {
  GROUPS,
  Lines,
  Section,
  causeLabel,
  causesWithoutRow,
  conditionLabel,
  OWN_ROLE_DRUNK,
  phaseText,
  useSeats,
  useTypeOf,
} from './common';
import styles from './console.module.css';

/** The end-game buttons. The one the rules suggest shimmers. */
const ENDINGS = [
  { winner: 'good', label: 'Good wins' },
  { winner: 'evil', label: 'Evil wins' },
  { winner: null, label: 'End with no winner' },
] as const;

/** Statuses the Storyteller can add by hand. A player holds each one at most once. */
const CONDITIONS = ['poisoned', 'drunk', 'mad'] as const;

/** One seat on the circle. Everything the Storyteller can change about a player opens from here. */
function SeatToken({ p, i, n, onOpen }: { p: GrimoirePlayer; i: number; n: number; onOpen: () => void }) {
  const names = useNames();
  const typeOf = useTypeOf();
  const { left, top, size } = seatPlace(i, n);
  const character = p.character ? names.roles[p.character] : 'No character';
  const believes = p.self.character && p.self.character !== p.character ? names.roles[p.self.character] : null;
  // Name the impairment ("drunk", "poisoned"), never a bare "impaired". Causes without a status row of their own,
  // such as the No Dashii's poison, still show.
  const unlisted = causesWithoutRow(p).map((c) =>
    causeLabel(c) === OWN_ROLE_DRUNK ? OWN_ROLE_DRUNK : (c.split(':')[0] ?? '').toLowerCase(),
  );
  const tags = [...new Set([...p.conditions.map(conditionLabel), ...unlisted])];
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
      <span className={`${styles['tokenLine']} type-${typeOf(p.character) ?? ''}`}>{character}</span>
      {believes && <span className={`${styles['tokenLine']} muted`}>thinks {believes}</span>}
      {tags.length > 0 && <span className={`${styles['tokenLine']} ${styles['warn']}`}>{tags.join(', ')}</span>}
    </button>
  );
}

const ORIGIN = { granted: 'gained', storyteller: 'from the Storyteller' } as const;

/** One status on the seat sheet. With `onRemove`, a × takes it off. */
function Status({
  label,
  detail,
  warn,
  onRemove,
  removeLabel,
}: {
  label: string;
  detail?: string | undefined;
  warn?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const { pending } = useCommand();
  return (
    <span className={warn ? styles['chip'] : styles['tag']}>
      {label}
      {detail && <span className={styles['chipDetail']}> · {detail}</span>}
      {onRemove && (
        <button
          type="button"
          className={styles['chipRemove']}
          aria-label={removeLabel ?? `Remove ${label}`}
          title={removeLabel ?? `Remove ${label}`}
          disabled={pending}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Everything the Storyteller can change about one player. As in 0.4.2, nearly all of it is a status to add or
 * remove: removing "dead" revives (which also clears "dead vote used"), whatever the engine does underneath.
 */
export function Seat({
  view,
  p,
  onChangeCharacter,
}: {
  view: StorytellerView;
  p: GrimoirePlayer;
  onChangeCharacter: () => void;
}) {
  const names = useNames();
  const typeOf = useTypeOf();
  const { run, pending } = useCommand();
  const [adding, setAdding] = useState(false);
  // Numbered as on the circle, which sorts by seat.
  const seat = useSeats(view).seated.findIndex((x) => x.id === p.id) + 1;
  const believes = p.self.character && p.self.character !== p.character ? names.roles[p.self.character] : null;
  // Facts the Storyteller does not set here, such as a setup field naming them ("Red herring").
  const facts = [
    ...view.setup.fields.filter((f) => f.kind === 'player' && f.value === p.id).map((f) => f.title),
    ...(p.abilities.some((a) => a.survivesDeath) ? ['keeps ability when dead'] : []),
    ...(p.departed ? ['left the game'] : []),
  ];
  const unlisted = causesWithoutRow(p);
  // Poisoned, drunk or mad from any source: adding it again would change nothing.
  const held = new Set<string>([...p.conditions.map((c) => c.type), ...p.causes.map((c) => c.split(':')[0] ?? '')]);
  const addable: { key: string; label: string; send: () => void }[] = [
    ...(p.alive
      ? [{ key: 'dead', label: 'dead', send: () => run({ type: 'mark_alive', playerId: p.id, alive: false }) }]
      : []),
    ...(!p.alive && !p.ghostVoteUsed
      ? [
          {
            key: 'vote',
            label: 'dead vote used',
            send: () => run({ type: 'set_ghost_vote', playerId: p.id, used: true }),
          },
        ]
      : []),
    ...CONDITIONS.filter((c) => !held.has(c)).map((condition) => ({
      key: condition,
      label: condition,
      send: () => run({ type: 'add_condition', target: p.id, condition }),
    })),
  ].map((a) => ({ ...a, send: () => void a.send() }));
  return (
    <article className={`${styles['seat']} ${p.alignment === 'evil' ? styles['seatEvil'] : styles['seatGood']}`}>
      <p className="muted small">Seat {seat}</p>
      <p className={`${styles['seatRole']} type-${typeOf(p.character) ?? ''}`}>
        {p.character ? names.roles[p.character] : 'No character'}
      </p>
      {believes && <p className="muted small">Believes they are the {believes}</p>}

      <div className={styles['chips']} role="group" aria-label={`Statuses of ${p.name}`}>
        {!p.alive && (
          <Status
            label="dead"
            warn
            detail={p.deathCause?.replaceAll('_', ' ')}
            removeLabel={`Revive ${p.name}`}
            onRemove={() => void run({ type: 'mark_alive', playerId: p.id, alive: true })}
          />
        )}
        {!p.alive && p.ghostVoteUsed && (
          <Status
            label="dead vote used"
            removeLabel={`Give ${p.name} their dead vote back`}
            onRemove={() => void run({ type: 'set_ghost_vote', playerId: p.id, used: false })}
          />
        )}
        {p.conditions.map((c) => (
          <Status
            key={c.id}
            label={conditionLabel(c)}
            warn={c.type === 'poisoned' || c.type === 'drunk'}
            detail={conditionLabel(c) === c.label ? `${c.sourceLabel}, until ${c.until}` : undefined}
            removeLabel={`Remove ${c.label} from ${p.name}`}
            onRemove={() => void run({ type: 'remove_condition', conditionId: c.id })}
          />
        ))}
        {unlisted.map((c) => (
          <Status key={c} label={causeLabel(c)} warn />
        ))}
        {facts.map((t) => (
          <Status key={t} label={t} />
        ))}
        {addable.length > 0 && (
          <Button tiny on={adding} aria-expanded={adding} onClick={() => setAdding(!adding)}>
            + status
          </Button>
        )}
      </div>
      {adding && addable.length > 0 && (
        <div className="row" role="group" aria-label={`Add a status to ${p.name}`}>
          {addable.map((a) => (
            <Button
              key={a.key}
              tiny
              disabled={pending}
              onClick={() => {
                a.send();
                setAdding(false);
              }}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      <div className={styles['seatRow']}>
        <span>Alignment</span>
        <Segments
          label={`Alignment of ${p.name}`}
          options={[
            { id: 'good', text: 'Good' },
            { id: 'evil', text: 'Evil' },
          ]}
          value={p.alignment}
          onChange={(alignment) => void run({ type: 'set_alignment', playerId: p.id, alignment })}
        />
      </div>

      {p.abilities.length > 0 && (
        <ul className={styles['rows']}>
          {p.abilities.map((a) => {
            // An ability from the player's own character needs no note; one gained elsewhere says from where.
            const notes = [
              ...(a.origin === 'character' ? [] : [`${ORIGIN[a.origin]} ${a.from}`]),
              ...(a.perceivedOnly ? ['only believed'] : []),
              ...(a.active ? [] : ['inactive']),
            ];
            return (
              <li key={a.id} className={styles['ability']}>
                <span>
                  <b className={`type-${typeOf(a.roleId) ?? ''}`}>{a.name}</b>
                  {notes.length > 0 && <span className="muted small"> {notes.join(', ')}</span>}
                </span>
                {a.summary.length > 0 && <Lines lines={a.summary} />}
                {a.reminder && <p className="muted small">{a.reminder}</p>}
                {a.oncePerGame &&
                  (a.usageAuto ? (
                    <span className="muted small">{a.used ? 'Used' : 'Unused'}, tracked automatically</span>
                  ) : (
                    <Segments
                      label={`${a.name} used`}
                      options={[
                        { id: 'unused', text: 'Unused' },
                        { id: 'used', text: 'Used' },
                      ]}
                      value={a.used ? 'used' : 'unused'}
                      onChange={(v) => void run({ type: 'set_ability_used', abilityId: a.id, used: v === 'used' })}
                    />
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      <Button onClick={onChangeCharacter}>Change character</Button>
    </article>
  );
}

/** Picks a new character, says what the change does, and sends nothing until Confirm is held. */
export function ChangeCharacter({ view, p, onDone }: { view: StorytellerView; p: GrimoirePlayer; onDone: () => void }) {
  const names = useNames();
  const typeOf = useTypeOf();
  const { run, pending } = useCommand();
  const [role, setRole] = useState<RoleId | ''>('');
  // Only a convenience: the server refuses duplicates and allows the roles that may repeat.
  const taken = new Set(
    view.players.filter((x) => x.seat !== null && x.id !== p.id && x.character).map((x) => x.character as string),
  );
  const traveller = typeOf(p.character) === 'traveller';
  const name = (id: string | null) => (id ? (names.roles[id] ?? id) : 'No character');
  return (
    <>
      <label className={styles['field']}>
        <span>New character for {p.name}</span>
        <select value={role} onChange={(e) => setRole(e.target.value as RoleId | '')}>
          <option value="">Choose…</option>
          {GROUPS.filter(([type]) => type !== 'traveller' || traveller).map(([type, label]) => {
            const roles = view.script.filter((r) => typeOf(r) === type);
            if (!roles.length) return null;
            return (
              <optgroup key={type} label={label}>
                {roles.map((r) => (
                  <option key={r} value={r} disabled={taken.has(r)}>
                    {name(r)}
                    {taken.has(r) ? ' (in play)' : ''}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>
      {role && (
        <ul className="small">
          <li>
            {name(p.character)} → {name(role)}
          </li>
          <li>
            Abilities this character gave are removed; alignment resets to the new character&apos;s natural alignment.
          </li>
          <li>
            {view.settings.notifyOnRoleChange
              ? "The player is told 'Your role has changed'."
              : 'The player is not told (setting off).'}
          </li>
        </ul>
      )}
      <SheetActions>
        <Button onClick={onDone}>Cancel</Button>
        <HoldButton
          variant="primary"
          disabled={!role || pending}
          onConfirm={() => {
            if (!role) return;
            void run({ type: 'assign_character', playerId: p.id, roleId: role }).then((ack) => {
              if (ack.ok) onDone();
            });
          }}
        >
          Confirm
        </HoldButton>
      </SheetActions>
    </>
  );
}

/** A setup field's value, in words. */
function fieldValue(f: SetupFieldSpec, names: ReturnType<typeof useNames>) {
  if (f.value === null) return 'not set';
  if (f.kind === 'player') return names.players[f.value] ?? f.value;
  if (f.kind === 'role') return names.roles[f.value] ?? f.value;
  return f.options.find((o) => o.id === f.value)?.label ?? f.value;
}

/** Removes every player, the Storyteller included, and resets the script. */
export function NewGameButton() {
  const { run } = useCommand();
  // This phone is signed out too, so nothing waits for the reply.
  return <HoldButton onConfirm={() => void run({ type: 'new_game' })}>New game (erase)</HoldButton>;
}

export function Grimoire({ view }: { view: StorytellerView }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const { seated } = useSeats(view);
  const [openId, setOpenId] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const open = seated.find((p) => p.id === openId);
  const ended = view.phase.kind === 'ended';
  // Game-end suggestions: those standing from earlier, and tonight's while the night is in review.
  const suggested = [...view.gameEnd, ...(view.review?.gameEnd ?? [])].filter(
    (g, i, all) => all.findIndex((x) => x.key === g.key) === i,
  );
  const close = () => {
    setOpenId(null);
    setChanging(false);
  };
  return (
    <div>
      <section className={styles['section']}>
        {seated.length > 0 ? (
          <>
            <div className={styles['circle']}>
              <div className={styles['circleCentre']}>
                <b>{phaseText(view)}</b>
                <div>
                  {seated.filter((p) => p.alive).length} / {seated.length} alive
                </div>
              </div>
              {seated.map((p, i) => (
                <SeatToken key={p.id} p={p} i={i} n={seated.length} onOpen={() => setOpenId(p.id)} />
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Nobody is seated.</p>
        )}
        {open && !changing && (
          <Sheet title={open.name} onClose={close}>
            <Seat view={view} p={open} onChangeCharacter={() => setChanging(true)} />
            <SheetActions>
              <Button onClick={close}>Close</Button>
            </SheetActions>
          </Sheet>
        )}
        {open && changing && (
          <Sheet title={`Change character of ${open.name}`} onClose={() => setChanging(false)}>
            <ChangeCharacter view={view} p={open} onDone={() => setChanging(false)} />
          </Sheet>
        )}
      </section>
      <Section title="Game facts">
        <p>Demon bluffs: {view.setup.bluffs.map((b) => names.roles[b] ?? b).join(', ') || 'none'}</p>
        {view.setup.fields.map((f) => (
          <p key={`${f.abilityId}:${f.field}`}>
            {f.title}: {fieldValue(f, names)}
          </p>
        ))}
        {view.storytellerAbilities.length > 0 && (
          <>
            <h3>Held by the Storyteller</h3>
            <ul className={styles['tags']}>
              {view.storytellerAbilities.map((a) => (
                <li key={a.id}>
                  {a.name}
                  {a.reminder ? `: ${a.reminder}` : ''}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
      <Section title="Game controls">
        <div className="row">
          {ended ? (
            <Button variant="primary" disabled={pending} onClick={() => void run({ type: 'play_again' })}>
              Play again
            </Button>
          ) : (
            <>
              {ENDINGS.map(({ winner, label }) => {
                const why = suggested.filter((g) => g.winner === winner).map((g) => g.reason);
                return (
                  <span key={label} title={why.length ? `The rules suggest this: ${why.join(' ')}` : undefined}>
                    <HoldButton
                      className={why.length ? styles['suggested'] : undefined}
                      onConfirm={() => void run({ type: 'end_game', winner })}
                    >
                      {label}
                    </HoldButton>
                  </span>
                );
              })}
            </>
          )}
          <NewGameButton />
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
