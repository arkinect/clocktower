import { useState } from 'react';
import type { Alignment, GrimoirePlayer, RoleCard, RoleId, SetupFieldSpec, StorytellerView } from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import { typeName } from '../player/parts';
import { Button, Card, HoldButton, Segments } from '../ui/ui';
import { Section, useSeats } from './common';
import styles from './console.module.css';

const SCRIPT_TYPES = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'] as const;
const TABLE_TYPES = ['fabled', 'loric'] as const;
const COUNT_LABELS = ['Townsfolk', 'Outsiders', 'Minions', 'Demons'];

export function Setup({ view }: { view: StorytellerView }) {
  const live = view.phase.kind !== 'lobby' && view.phase.kind !== 'setup';
  return (
    <div>
      {live && <Card tone="warn">The game is running. Changes here apply at once.</Card>}
      <div className={styles['columns']}>
        <div>
          <Checklist view={view} />
          <Seating view={view} />
          <Assignment view={view} />
        </div>
        <div>
          <Bluffs view={view} />
          <Fields view={view} />
          <TypeCounts view={view} />
          <Settings view={view} />
          <Script view={view} />
        </div>
      </div>
    </div>
  );
}

function Checklist({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const { checklist, warnings } = view.setup;
  const ready = checklist.every((c) => !c.blocking || c.done);
  return (
    <Section title="Before Night 0">
      <ul className={styles['checks']}>
        {checklist.map((c) => (
          <li key={c.id} className={c.done ? styles['done'] : c.blocking ? styles['todo'] : styles['optional']}>
            {c.done ? '✓' : c.blocking ? '✗' : '•'} {c.label}
          </li>
        ))}
      </ul>
      {warnings.map((w) => (
        <Card key={w} tone="warn">
          {w}
        </Card>
      ))}
      {view.phase.kind === 'setup' && (
        <div className="row">
          <HoldButton
            variant="primary"
            disabled={!ready || pending}
            onConfirm={() => void run({ type: 'begin_first_night' })}
          >
            Begin Night 0
          </HoldButton>
          {!ready && (
            <HoldButton onConfirm={() => void run({ type: 'begin_first_night', force: true })}>Force start</HoldButton>
          )}
        </div>
      )}
      {view.phase.kind === 'lobby' && (
        <Button variant="primary" big onClick={() => void run({ type: 'open_setup' })}>
          Continue to setup
        </Button>
      )}
    </Section>
  );
}

function Seating({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const { seated } = useSeats(view);
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= seated.length || from === to) return;
    const order = seated.map((p) => p.id);
    const [row] = order.splice(from, 1);
    if (row) order.splice(to, 0, row);
    void run({ type: 'set_seating', order });
  };
  const unseated = view.players.filter((p) => p.seat === null);
  return (
    <Section title="Seating">
      <ol className={styles['rows']}>
        {seated.map((p, i) => (
          <li
            key={p.id}
            draggable
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragging !== null) move(dragging, i);
              setDragging(null);
            }}
          >
            <span className={styles['grow']}>
              {i + 1}. {p.name}
            </span>
            <Button tiny aria-label={`Move ${p.name} up`} disabled={i === 0 || pending} onClick={() => move(i, i - 1)}>
              ↑
            </Button>
            <Button
              tiny
              aria-label={`Move ${p.name} down`}
              disabled={i === seated.length - 1 || pending}
              onClick={() => move(i, i + 1)}
            >
              ↓
            </Button>
          </li>
        ))}
      </ol>
      {unseated.length > 0 && <p className="muted small">Not seated: {unseated.map((p) => p.name).join(', ')}</p>}
      <div className="row">
        <Button disabled={pending} onClick={() => void run({ type: 'randomise_seating' })}>
          Randomise
        </Button>
        <Button disabled={pending} onClick={() => void run({ type: 'publish_seating' })}>
          {view.seatingPublished ? 'Published. Publish again' : 'Publish to phones'}
        </Button>
      </div>
    </Section>
  );
}

function RoleSelect({
  label,
  value,
  options,
  onChange,
  none,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (id: RoleId | null) => void;
  none: string;
}) {
  const names = useNames();
  return (
    <label className={styles['inline']}>
      <span>{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange((e.target.value as RoleId) || null)}>
        <option value="">{none}</option>
        {options.map((r) => (
          <option key={r} value={r}>
            {names.roles[r] ?? r}
          </option>
        ))}
      </select>
    </label>
  );
}

function AssignRow({ view, player }: { view: StorytellerView; player: GrimoirePlayer }) {
  const { run } = useCommand();
  const believed = view.setup.believedOptions[player.id];
  return (
    <div className={styles['assign']}>
      <b>{player.name}</b>
      <RoleSelect
        label={`Character for ${player.name}`}
        value={player.character}
        options={view.script}
        none="No character"
        onChange={(roleId) => void run({ type: 'assign_character', playerId: player.id, roleId })}
      />
      <label className={styles['inline']}>
        <span>Alignment of {player.name}</span>
        <select
          value={player.alignment}
          onChange={(e) =>
            void run({ type: 'set_alignment', playerId: player.id, alignment: e.target.value as Alignment })
          }
        >
          <option value="good">Good</option>
          <option value="evil">Evil</option>
        </select>
      </label>
      {believed && (
        <RoleSelect
          label={`${player.name} believes they are`}
          value={player.self.character}
          options={believed}
          none="Choose…"
          onChange={(roleId) => void run({ type: 'set_believed', playerId: player.id, roleId })}
        />
      )}
    </div>
  );
}

function Assignment({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const { seated } = useSeats(view);
  return (
    <Section title="Characters">
      <div className="row">
        <Button disabled={pending} onClick={() => void run({ type: 'suggest_distribution' })}>
          Suggest characters
        </Button>
      </div>
      {seated.map((p) => (
        <AssignRow key={p.id} view={view} player={p} />
      ))}
      {!seated.length && <p className="muted">Seat the players first.</p>}
    </Section>
  );
}

function Bluffs({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const { bluffs, bluffCandidates } = view.setup;
  const set = (i: number, id: RoleId | null) => {
    const next: (RoleId | undefined)[] = [bluffs[0], bluffs[1], bluffs[2]];
    next[i] = id ?? undefined;
    void run({ type: 'set_bluffs', roleIds: next.filter((x): x is RoleId => !!x) });
  };
  return (
    <Section title="Demon bluffs">
      {[0, 1, 2].map((i) => (
        <RoleSelect
          key={i}
          label={`Bluff ${i + 1}`}
          value={bluffs[i] ?? null}
          options={[...new Set([...(bluffs[i] ? [bluffs[i] as string] : []), ...bluffCandidates])]}
          none="None"
          onChange={(id) => set(i, id)}
        />
      ))}
      <Button disabled={pending} onClick={() => void run({ type: 'suggest_bluffs' })}>
        Suggest bluffs
      </Button>
    </Section>
  );
}

function Field({ spec }: { spec: SetupFieldSpec }) {
  const { run, pending } = useCommand();
  const set = (value: string | null) =>
    void run({ type: 'set_setup_field', abilityId: spec.abilityId, field: spec.field, value });
  return (
    <div className={styles['field']}>
      <span>{spec.title}</span>
      <div className="row">
        {spec.kind === 'text' ? (
          <input
            key={spec.value}
            aria-label={spec.title}
            defaultValue={spec.value ?? ''}
            maxLength={64}
            onBlur={(e) => set(e.target.value.trim() || null)}
          />
        ) : (
          <select aria-label={spec.title} value={spec.value ?? ''} onChange={(e) => set(e.target.value || null)}>
            <option value="">Not set</option>
            {spec.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {spec.suggestible && (
          <Button
            tiny
            disabled={pending}
            onClick={() => void run({ type: 'suggest_setup_field', abilityId: spec.abilityId, field: spec.field })}
          >
            Suggest
          </Button>
        )}
      </div>
    </div>
  );
}

function Fields({ view }: { view: StorytellerView }) {
  if (!view.setup.fields.length) return null;
  return (
    <Section title="Character setup">
      {view.setup.fields.map((f) => (
        <Field key={`${f.abilityId}:${f.field}`} spec={f} />
      ))}
    </Section>
  );
}

function TypeCounts({ view }: { view: StorytellerView }) {
  const { run } = useCommand();
  const { target, actual, source } = view.setup.counts;
  const set = (i: number, n: number) => {
    const counts = target.map((x, j) => (j === i ? n : x));
    void run({ type: 'set_type_counts', counts });
  };
  return (
    <Section title="Character types">
      <div className={styles['counts']}>
        {COUNT_LABELS.map((label, i) => (
          <label key={label}>
            <span>
              {label} ({actual[i] ?? 0} assigned)
            </span>
            <input
              type="number"
              min={0}
              max={40}
              value={target[i] ?? 0}
              onChange={(e) => set(i, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      {source === 'override' && (
        <Button tiny onClick={() => void run({ type: 'set_type_counts', counts: null })}>
          Back to the default
        </Button>
      )}
    </Section>
  );
}

function Settings({ view }: { view: StorytellerView }) {
  const { run } = useCommand();
  const s = view.settings;
  return (
    <Section title="Settings">
      <div className={styles['field']}>
        <span>Evil information</span>
        <Segments
          label="Evil information"
          options={[
            { id: 'house', text: 'House' },
            { id: 'official', text: 'Official' },
          ]}
          value={s.evilInfoPolicy}
          onChange={(evilInfoPolicy) => void run({ type: 'set_settings', evilInfoPolicy })}
        />
      </div>
      <label className={styles['inline']}>
        <span>Night countdown in seconds</span>
        <input
          key={s.countdownSeconds}
          type="number"
          min={0}
          defaultValue={s.countdownSeconds}
          onBlur={(e) => void run({ type: 'set_settings', countdownSeconds: Number(e.target.value) })}
        />
      </label>
      <label className={styles['inline']}>
        <span>Extra seconds for a follow-up question</span>
        <input
          key={s.followUpExtensionSeconds}
          type="number"
          min={0}
          defaultValue={s.followUpExtensionSeconds}
          onBlur={(e) => void run({ type: 'set_settings', followUpExtensionSeconds: Number(e.target.value) })}
        />
      </label>
      <label className={styles['check']}>
        <input
          type="checkbox"
          checked={s.announceDeaths}
          onChange={(e) => void run({ type: 'set_settings', announceDeaths: e.target.checked })}
        />
        Announce deaths on phones
      </label>
      <label className={styles['check']}>
        <input
          type="checkbox"
          checked={s.notifyOnRoleChange}
          onChange={(e) => void run({ type: 'set_settings', notifyOnRoleChange: e.target.checked })}
        />
        Tell a player when their character changes
      </label>
    </Section>
  );
}

function RoleChecks({
  roles,
  on,
  onToggle,
}: {
  roles: RoleCard[];
  on: readonly string[];
  onToggle: (id: RoleId, checked: boolean) => void;
}) {
  return (
    <div className={styles['roleChecks']}>
      {[...roles]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => (
          <label key={r.roleId} className={styles['check']}>
            <input
              type="checkbox"
              checked={on.includes(r.roleId)}
              onChange={(e) => onToggle(r.roleId, e.target.checked)}
            />
            <span className={`type-${r.type}`}>{r.name}</span>
          </label>
        ))}
    </div>
  );
}

function Script({ view }: { view: StorytellerView }) {
  const { catalog } = useGame();
  const { run } = useCommand();
  const inScript = catalog.filter((c) => (SCRIPT_TYPES as readonly string[]).includes(c.type));
  const toggle = (id: RoleId, checked: boolean) =>
    void run({
      type: 'set_script',
      roleIds: checked ? [...view.script, id] : view.script.filter((r) => r !== id),
    });
  const table = view.setup.storytellerCharacters;
  return (
    <Section title={`Script (${view.script.length} roles)`}>
      <div className="row">
        <Button tiny onClick={() => void run({ type: 'set_script', roleIds: inScript.map((c) => c.roleId) })}>
          All roles
        </Button>
        <Button tiny onClick={() => void run({ type: 'set_script', roleIds: [] })}>
          Clear
        </Button>
      </div>
      {SCRIPT_TYPES.map((t) => {
        const roles = inScript.filter((c) => c.type === t);
        if (!roles.length) return null;
        return (
          <div key={t}>
            <h3 className={`type-${t}`}>{typeName(t)}</h3>
            <RoleChecks roles={roles} on={view.script} onToggle={toggle} />
          </div>
        );
      })}
      {TABLE_TYPES.map((t) => {
        const roles = catalog.filter((c) => c.type === t);
        if (!roles.length) return null;
        return (
          <div key={t}>
            <h3 className={`type-${t}`}>{typeName(t)}</h3>
            <RoleChecks
              roles={roles}
              on={table}
              onToggle={(id, checked) =>
                void run({
                  type: 'set_storyteller_characters',
                  roleIds: checked ? [...table, id] : table.filter((r) => r !== id),
                })
              }
            />
          </div>
        );
      })}
    </Section>
  );
}
