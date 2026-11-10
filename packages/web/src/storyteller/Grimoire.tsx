import { useState } from 'react';
import type { CharacterType, GrimoirePlayer, RoleId, SetupFieldSpec, StorytellerView } from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import { Button, HoldButton, Segments, Sheet, SheetActions } from '../ui/ui';
import { seatPlace } from './circle';
import { Lines, Section, causeLabel, causesWithoutRow, phaseText, useSeats } from './common';
import styles from './console.module.css';

const QUICK = [
  ['poisoned', '+ poisoned'],
  ['drunk', '+ drunk'],
  ['mad', '+ mad'],
] as const;

const GROUPS: [CharacterType, string][] = [
  ['townsfolk', 'Townsfolk'],
  ['outsider', 'Outsiders'],
  ['minion', 'Minions'],
  ['demon', 'Demons'],
  ['traveller', 'Travellers'],
];

/** The character type of a role, for its colour. */
function useTypeOf() {
  const { catalog } = useGame();
  return (id: string | null) => (id ? catalog.find((c) => c.roleId === id)?.type : undefined);
}

/** One seat on the circle. Everything the Storyteller can change about a player opens from here. */
function SeatToken({ p, i, n, onOpen }: { p: GrimoirePlayer; i: number; n: number; onOpen: () => void }) {
  const names = useNames();
  const typeOf = useTypeOf();
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
      <span className={`${styles['tokenLine']} type-${typeOf(p.character) ?? ''}`}>{character}</span>
      {believes && <span className={`${styles['tokenLine']} muted`}>thinks {believes}</span>}
      {tags.length > 0 && <span className={`${styles['tokenLine']} ${styles['warn']}`}>{tags.join(', ')}</span>}
    </button>
  );
}

const ORIGIN = { character: 'own character', granted: 'gained', storyteller: 'from the Storyteller' } as const;

/** Everything a 0.4.2 Grimoire card held, top to bottom. */
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
  // Numbered as on the circle, which sorts by seat.
  const seat = useSeats(view).seated.findIndex((x) => x.id === p.id) + 1;
  const believes = p.self.character && p.self.character !== p.character ? names.roles[p.self.character] : null;
  // A player named by a setup field: "Fortune Teller's red herring".
  const tags = [
    ...view.setup.fields.filter((f) => f.kind === 'player' && f.value === p.id).map((f) => f.title),
    ...(p.abilities.some((a) => a.survivesDeath) ? ['keeps ability when dead'] : []),
  ];
  const unlisted = causesWithoutRow(p);
  return (
    <article className={`${styles['seat']} ${p.alignment === 'evil' ? styles['seatEvil'] : styles['seatGood']}`}>
      <p className="muted small">
        Seat {seat} <span className={p.connected ? styles['dotOn'] : styles['dot']} />{' '}
        {p.connected ? 'online' : 'offline'}
        {p.alive ? '' : ' (dead)'}
        {p.departed ? ' (left)' : ''}
      </p>
      <p className={`${styles['seatRole']} type-${typeOf(p.character) ?? ''}`}>
        {p.character ? names.roles[p.character] : 'No character'}
      </p>
      {believes && <p className="muted small">Believes they are the {believes}</p>}
      {p.deathCause && <p className="muted small">Died: {p.deathCause.replaceAll('_', ' ')}</p>}
      {tags.length > 0 && (
        <p className={styles['chips']}>
          {tags.map((t) => (
            <span key={t} className={styles['tag']}>
              {t}
            </span>
          ))}
        </p>
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

      <div className="row">
        <Button disabled={pending} onClick={() => void run({ type: 'mark_alive', playerId: p.id, alive: !p.alive })}>
          {p.alive ? 'Kill' : 'Revive'}
        </Button>
        {!p.alive && (
          <Button
            on={p.ghostVoteUsed}
            aria-pressed={p.ghostVoteUsed}
            disabled={pending}
            onClick={() => void run({ type: 'set_ghost_vote', playerId: p.id, used: !p.ghostVoteUsed })}
          >
            {p.ghostVoteUsed ? 'Vote used' : 'Vote available'}
          </Button>
        )}
      </div>

      {p.abilities.length > 0 && (
        <ul className={styles['rows']}>
          {p.abilities.map((a) => (
            <li key={a.id} className={styles['ability']}>
              <span>
                <b className={`type-${typeOf(a.roleId) ?? ''}`}>{a.name}</b>{' '}
                <span className="muted small">
                  {a.origin === 'character' ? ORIGIN.character : `${ORIGIN[a.origin]} ${a.from}`}
                  {a.perceivedOnly ? ', only believed' : ''}
                  {a.active ? '' : ', inactive'}
                </span>
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
          ))}
        </ul>
      )}

      {unlisted.length > 0 && (
        <p className={styles['chips']}>
          {unlisted.map((c) => (
            <span key={c} className={styles['chip']}>
              {causeLabel(c)}
            </span>
          ))}
        </p>
      )}
      {p.conditions.length > 0 && (
        <ul className={styles['tags']}>
          {p.conditions.map((c) => (
            <li key={c.id}>
              {c.label}{' '}
              <span className="muted small">
                {c.sourceLabel} · until {c.until}
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
      )}
      <div className="row">
        {QUICK.map(([condition, label]) => (
          <Button
            key={condition}
            tiny
            disabled={pending}
            onClick={() => void run({ type: 'add_condition', target: p.id, condition })}
          >
            {label}
          </Button>
        ))}
      </div>
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
  return (
    <div>
      {/* This phone is signed out too, so nothing waits for the reply. */}
      <HoldButton onConfirm={() => void run({ type: 'new_game' })}>New game (erase)</HoldButton>
      <p className="muted small">
        Removes every player, you included (everyone joins again), resets the script to the default, and ends any game
        in progress. Settings are kept.
      </p>
    </div>
  );
}

export function Grimoire({ view }: { view: StorytellerView }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const { seated } = useSeats(view);
  const [openId, setOpenId] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const open = seated.find((p) => p.id === openId);
  const ended = view.phase.kind === 'ended';
  const close = () => {
    setOpenId(null);
    setChanging(false);
  };
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
      </Section>
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
        <NewGameButton />
      </Section>
    </div>
  );
}
