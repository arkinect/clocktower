// Small helpers shared by the console panels.
import { useMemo, useState, type ReactNode } from 'react';
import type { CharacterType, GrimoirePlayer, PlayerId, StorytellerView } from '@ct/protocol';
import { useGame, useNames } from '../app/store';
import { Button, Sheet, SheetActions } from '../ui/ui';
import styles from './console.module.css';

/** Game-end suggestions are computed but not shown yet. Turn on in a later release. */
export const SHOW_GAME_END_CARDS = false;

/** The character types, in the order role dropdowns list them under dividers. */
export const GROUPS: [CharacterType, string][] = [
  ['townsfolk', 'Townsfolk'],
  ['outsider', 'Outsiders'],
  ['minion', 'Minions'],
  ['demon', 'Demons'],
  ['traveller', 'Travellers'],
];

/** The character type of a role, for its colour and its group. */
export function useTypeOf() {
  const { catalog } = useGame();
  return (id: string | null) => (id ? catalog.find((c) => c.roleId === id)?.type : undefined);
}

export function useSeats(view: StorytellerView) {
  return useMemo(() => {
    const seated = view.players.filter((p) => p.seat !== null).sort((a, b) => (a.seat as number) - (b.seat as number));
    return { seated, dead: new Set<string>(view.players.filter((p) => !p.alive).map((p) => p.id)) };
  }, [view.players]);
}

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** An impairment cause ("poisoned:Poisoner") in plain words. */
export function causeLabel(cause: string) {
  const [type = '', source = ''] = cause.split(':');
  if (source === 'storyteller') return `${titleCase(type)} (set by you)`;
  if (source === 'Drunk' || source === 'Marionette') return 'Drunk/Marionette (own role)';
  return `${titleCase(type)} by the ${source}`;
}

/** Causes with no condition row of their own, such as the No Dashii's. */
export const causesWithoutRow = (p: GrimoirePlayer) =>
  p.causes.filter(
    (cause) => !p.conditions.some((c) => `${c.type}:${c.sourceLabel}`.toLowerCase() === cause.toLowerCase()),
  );

export function phaseText(view: StorytellerView) {
  const { kind, n, stage } = view.phase;
  if (kind === 'night') return `Night ${n}: ${stage}`;
  if (kind === 'day') return `Day ${n}`;
  return { lobby: 'Lobby', setup: 'Setup', ended: 'Game over' }[kind];
}

/** A player's name, marked when dead. With `role`, their character as well. */
export function Who({ view, id, role }: { view: StorytellerView; id: string | null; role?: boolean }) {
  const names = useNames();
  const p = view.players.find((x) => x.id === id);
  if (!id) return <>nobody</>;
  const character = role && p?.character ? names.roles[p.character] : null;
  return (
    <span className={p && !p.alive ? styles['dead'] : undefined}>
      {names.players[id] ?? id}
      {character ? ` (${character})` : ''}
      {p && !p.alive ? ' (dead)' : ''}
    </span>
  );
}

export function PlayerSelect({
  label,
  players,
  value,
  onChange,
  none,
}: {
  label: string;
  players: GrimoirePlayer[];
  value: string;
  onChange: (id: PlayerId | '') => void;
  none?: string;
}) {
  return (
    <label className={styles['field']}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as PlayerId | '')}>
        <option value="">{none ?? 'Choose…'}</option>
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.alive ? '' : ' (dead)'}
          </option>
        ))}
      </select>
    </label>
  );
}

export const Section = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section className={styles['section']}>
    <h2>{title}</h2>
    {children}
  </section>
);

export const Lines = ({ lines }: { lines: string[] }) => (
  <>
    {lines.map((l, i) => (
      <p key={i}>{l}</p>
    ))}
  </>
);

/** A bottom sheet asking for one value. It closes once the save works, and Enter saves. */
export function InputSheet({
  title,
  label,
  initial,
  multiline,
  maxLength,
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  initial: string;
  multiline?: boolean;
  maxLength?: number;
  onSave: (value: string) => Promise<{ ok: boolean }>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const save = async () => {
    if (!value.trim()) return;
    if ((await onSave(value.trim())).ok) onClose();
  };
  const common = { value, autoFocus: true, ...(maxLength ? { maxLength } : {}) };
  return (
    <Sheet title={title} onClose={onClose}>
      <label className={styles['field']}>
        <span>{label}</span>
        {multiline ? (
          <textarea {...common} rows={4} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <input
            {...common}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save();
            }}
          />
        )}
      </label>
      <SheetActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!value.trim()} onClick={() => void save()}>
          Save
        </Button>
      </SheetActions>
    </Sheet>
  );
}
