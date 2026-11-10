import { useState } from 'react';
import type {
  ActionField,
  Alignment,
  Choice,
  DayActionSpec,
  Decisions,
  GrimoirePlayer,
  PlayerId,
  RoleId,
  StorytellerView,
} from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, HoldButton, Segments } from '../ui/ui';
import { PlayerSelect, SHOW_GAME_END_CARDS, Section, Who, causeLabel, useSeats } from './common';
import styles from './console.module.css';

interface Preview {
  summary?: string;
  effective?: boolean;
  decisions?: {
    key: Decisions[number]['key'];
    title: string;
    description: string;
    options: { id: string; label: string }[];
    default: string;
    chosen: string | null;
  }[];
}

/** Any role's day action: the same three field kinds as the night, plus preview and accept when it has consequences. */
export function DayAction({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const current = choice[spec.key];
  const ready = choiceComplete(spec, current);
  const decisions: Decisions = (preview?.decisions ?? []).flatMap((d) => {
    const option = picked[JSON.stringify(d.key)];
    return option ? [{ key: d.key, option }] : [];
  });

  const send = async (mode: 'preview' | 'accept' | 'force_success' | 'force_fail') => {
    const ack = await run({
      type: 'day_action',
      abilityId: spec.abilityId,
      action: spec.action,
      values: current?.values ?? [],
      mode,
      ...(decisions.length ? { decisions } : {}),
    });
    if (!ack.ok) return;
    if (mode === 'preview') {
      setPreview(ack.data as Preview);
    } else {
      setPreview(null);
      setChoice({});
      setPicked({});
    }
  };

  return (
    <article className={styles['result']}>
      <h3>{spec.title}</h3>
      <Picker
        specs={[spec]}
        names={names}
        value={choice}
        onChange={(v) => {
          setChoice(v);
          setPreview(null);
        }}
        dead={dead}
      />
      {preview && (
        <Card tone="notice">
          <p>{preview.summary}</p>
          {(preview.decisions ?? []).map((d) => (
            <div key={JSON.stringify(d.key)}>
              <p>
                <b>{d.title}</b> {d.description}
              </p>
              <Segments
                label={d.title}
                options={d.options.map((o) => ({ id: o.id, text: o.label }))}
                value={picked[JSON.stringify(d.key)] ?? d.chosen ?? d.default}
                onChange={(option) => {
                  setPicked({ ...picked, [JSON.stringify(d.key)]: option });
                }}
              />
            </div>
          ))}
        </Card>
      )}
      <div className="row">
        {spec.preview && (
          <Button tiny disabled={!ready || pending} onClick={() => void send('preview')}>
            Preview
          </Button>
        )}
        <Button
          tiny
          variant="primary"
          disabled={!ready || pending || (spec.preview && !preview)}
          onClick={() => void send('accept')}
        >
          Accept
        </Button>
        {spec.preview && (
          <>
            <Button tiny disabled={!ready || pending} onClick={() => void send('force_success')}>
              Force it to work
            </Button>
            <Button tiny disabled={!ready || pending} onClick={() => void send('force_fail')}>
              Force it to fail
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

/** Impairment with its causes, and every other condition with its source ("Cursed (Witch)"). */
export function Status({ player }: { player: GrimoirePlayer }) {
  const others = player.conditions.filter((c) => c.type !== 'drunk' && c.type !== 'poisoned');
  if (!player.causes.length && !others.length) return null;
  return (
    <span className={styles['chips']}>
      {player.causes.map((c) => (
        <span key={c} className={styles['chip']}>
          {causeLabel(c)}
        </span>
      ))}
      {others.map((c) => (
        <span key={c.id} className={styles['chipPlain']}>
          {c.label} ({c.sourceLabel})
        </span>
      ))}
    </span>
  );
}

/** The day's players, as in 0.4.2: who they are, what affects them today, and one action. */
function Players({ view, seated }: { view: StorytellerView; seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  return (
    <Section title={`Day ${view.phase.n}`}>
      <table className={styles['tbl']}>
        <tbody>
          {seated.map((p) => (
            <tr key={p.id}>
              <td>
                <Who view={view} id={p.id} role />
              </td>
              <td>
                <Status player={p} />
              </td>
              <td className={styles['act']}>
                {p.alive ? (
                  <Button
                    tiny
                    disabled={pending}
                    onClick={() => void run({ type: 'mark_alive', playerId: p.id, alive: false })}
                  >
                    Dead
                  </Button>
                ) : p.ghostVoteUsed ? (
                  <span className={styles['tag']}>Dead vote used</span>
                ) : (
                  <Button
                    tiny
                    disabled={pending}
                    onClick={() => void run({ type: 'set_ghost_vote', playerId: p.id, used: true })}
                  >
                    Dead vote
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Revive a player or give back a dead vote in the Grimoire.</p>
    </Section>
  );
}

/** The last execution recorded today, in one line. */
function executedToday(view: StorytellerView, names: Record<string, string>) {
  const e = view.dayEvents.findLast((x) => x.kind === 'execution');
  if (!e) return 'Nothing recorded yet: counts as no execution at dusk.';
  if (!e.playerId) return 'No execution today.';
  const p = view.players.find((x) => x.id === e.playerId);
  return `Executed today: ${names[e.playerId] ?? e.playerId}${p?.alive ? ' (survived)' : ''}`;
}

function Execution({ view, seated }: { view: StorytellerView; seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  const names = useNames();
  const [executed, setExecuted] = useState<PlayerId | ''>('');
  const reminders = seated
    .flatMap((p) => p.abilities.map((a) => ({ p, a })))
    .filter(({ a }) => !a.perceivedOnly && a.active && a.dayReminder && a.reminder);
  return (
    <Section title="Execution">
      <div className={styles['formRow']}>
        <label className={styles['field']}>
          <span>Executed</span>
          <select value={executed} onChange={(e) => setExecuted(e.target.value as PlayerId | '')}>
            <option value="">No execution today</option>
            {seated
              .filter((p) => p.alive)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.character ? ` (${names.roles[p.character] ?? p.character})` : ''}
                </option>
              ))}
          </select>
        </label>
        <Button
          disabled={pending}
          onClick={() => {
            void run({ type: 'record_execution', playerId: executed || null, died: true });
            setExecuted('');
          }}
        >
          Execute
        </Button>
      </div>
      <p>{executedToday(view, names.players)}</p>
      <p className="muted small">
        The executed player dies now, unless something stops it (Fool, Devil's Advocate, Sailor, Tea Lady): then they
        stay alive and the execution still counts. Other characters react when you start the night. If you picked the
        wrong player, revive them in the Grimoire before starting the night.
      </p>
      {reminders.length > 0 && (
        <ul className="small">
          {reminders.map(({ p, a }) => (
            <li key={a.id}>
              <b>{a.name}</b> ({p.name}): {a.reminder}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

type Names = ReturnType<typeof useNames>;

const optionLabel = (field: ActionField, id: string, names: Names) =>
  field.kind === 'player'
    ? (names.players[id] ?? id)
    : field.kind === 'role'
      ? (names.roles[id] ?? id)
      : (field.labels?.[id] ?? id);

/** A fact for tonight: its recorded answer shown in place, and sent as soon as it changes. */
export function Fact({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const { run, pending } = useCommand();
  const names = useNames();
  const field = spec.fields.length === 1 ? spec.fields[0] : undefined;
  // A fact with several fields needs the full form. No role has one yet.
  if (!field) return <DayAction view={view} spec={spec} />;
  const value = spec.recorded?.[0] ?? null;
  const send = (v: string) =>
    void run({ type: 'day_action', abilityId: spec.abilityId, action: spec.action, values: [v], mode: 'accept' });
  return (
    <div className={styles['fact']}>
      <b>{spec.title}</b>
      {field.kind === 'option' && field.options.length <= 3 ? (
        <Segments
          label={spec.title}
          options={field.options.map((o) => ({ id: o, text: optionLabel(field, o, names) }))}
          value={value}
          onChange={send}
        />
      ) : (
        <select
          aria-label={spec.title}
          value={value ?? ''}
          disabled={pending}
          onChange={(e) => {
            if (e.target.value) send(e.target.value);
          }}
        >
          <option value="">Not recorded</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {optionLabel(field, o, names)}
            </option>
          ))}
        </select>
      )}
      {spec.neededTonight && !spec.recorded && (
        <p className="muted small">Needed tonight. If you leave it, Review will ask for it.</p>
      )}
    </div>
  );
}

function Travellers({ view, seated }: { view: StorytellerView; seated: GrimoirePlayer[] }) {
  const { catalog } = useGame();
  const { run, pending } = useCommand();
  const [player, setPlayer] = useState<PlayerId | ''>('');
  const [role, setRole] = useState('');
  const [alignment, setAlignment] = useState<Alignment>('good');
  const travellers = catalog.filter((c) => c.type === 'traveller');
  const inPlay = view.players.filter((p) => catalog.find((c) => c.roleId === p.character)?.type === 'traveller');
  const unseated = view.players.filter((p) => p.seat === null);
  return (
    <Section title="Travellers">
      <ul className={styles['rows']}>
        {inPlay.map((p) => (
          <li key={p.id}>
            <span className={styles['grow']}>
              <Who view={view} id={p.id} role />
            </span>
            <HoldButton onConfirm={() => void run({ type: 'exile_traveller', playerId: p.id })}>Exile</HoldButton>
            <Button tiny disabled={pending} onClick={() => void run({ type: 'remove_traveller', playerId: p.id })}>
              Leaves
            </Button>
          </li>
        ))}
      </ul>
      <div className={styles['formRow']}>
        <PlayerSelect
          label="New Traveller"
          players={unseated.length ? unseated : seated}
          value={player}
          onChange={setPlayer}
        />
        <label className={styles['field']}>
          <span>Character</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Choose…</option>
            {travellers.map((c) => (
              <option key={c.roleId} value={c.roleId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles['field']}>
          <span>Alignment</span>
          <select value={alignment} onChange={(e) => setAlignment(e.target.value as Alignment)}>
            <option value="good">Good</option>
            <option value="evil">Evil</option>
          </select>
        </label>
        <Button
          tiny
          disabled={!player || !role || pending}
          onClick={() => {
            if (player && role) {
              void run({ type: 'add_traveller', playerId: player, roleId: role as RoleId, alignment });
            }
          }}
        >
          Add Traveller
        </Button>
      </div>
    </Section>
  );
}

/** Once-per-game abilities, used or not. Their reminders are under Execution and in the Grimoire. */
export function Usage({ seated }: { seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  const held = seated
    .flatMap((p) => p.abilities.map((a) => ({ p, a })))
    .filter(({ a }) => !a.perceivedOnly && a.oncePerGame);
  if (!held.length) return null;
  return (
    <Section title="Ability tracker">
      <ul className={styles['rows']}>
        {held.map(({ p, a }) => (
          <li key={a.id}>
            <label className={styles['check']}>
              <input
                type="checkbox"
                checked={a.used}
                disabled={a.usageAuto || pending}
                onChange={(e) => void run({ type: 'set_ability_used', abilityId: a.id, used: e.target.checked })}
              />
              {a.name}, {p.name}
              {a.usageAuto ? <span className="muted small"> tracked automatically</span> : null}
            </label>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Notes({ view }: { view: StorytellerView }) {
  const { run } = useCommand();
  return (
    <label className={styles['field']}>
      <span>Notes</span>
      <textarea
        key={view.notes}
        rows={4}
        maxLength={2000}
        defaultValue={view.notes}
        onBlur={(e) => {
          if (e.target.value !== view.notes) void run({ type: 'set_notes', text: e.target.value });
        }}
      />
    </label>
  );
}

export function Day({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const { catalog } = useGame();
  const { seated } = useSeats(view);
  if (view.phase.kind !== 'day') return <Card>It is not day.</Card>;
  const facts = view.dayActions.filter((a) => !a.preview);
  const abilities = view.dayActions.filter((a) => a.preview);
  // Hidden while the app has no Traveller characters.
  const travellers = catalog.some((c) => c.type === 'traveller');
  return (
    <div>
      {SHOW_GAME_END_CARDS &&
        view.gameEnd.map((g) => (
          <Card key={g.key} tone="notice">
            <p>
              <b>{g.winner ? `${g.winner === 'good' ? 'Good' : 'Evil'} may have won.` : 'The game may be over.'}</b>{' '}
              {g.reason}
            </p>
            <div className="row">
              <Button
                variant="primary"
                disabled={pending}
                onClick={() => void run({ type: 'confirm_game_end', key: g.key })}
              >
                End the game
              </Button>
              <Button disabled={pending} onClick={() => void run({ type: 'dismiss_game_end', key: g.key })}>
                Carry on
              </Button>
            </div>
          </Card>
        ))}
      {view.prompts.map((p) => (
        <Card key={p.id} tone="warn">
          <p>
            <b>{p.title}</b> {p.description}
          </p>
          <div className="row">
            {p.options.map((o) => (
              <Button
                key={o.id}
                disabled={pending}
                onClick={() => void run({ type: 'resolve_prompt', id: p.id, option: o.id })}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </Card>
      ))}
      {view.dayNotices.map((n) => (
        <Card key={n}>{n}</Card>
      ))}
      <div className={styles['columns']}>
        <div>
          <Players view={view} seated={seated} />
          <Execution view={view} seated={seated} />
        </div>
        <div>
          <Section title="Facts for tonight">
            {facts.map((a) => (
              <Fact key={a.key} view={view} spec={a} />
            ))}
            {!facts.length && <p className="muted">No character needs a fact from today.</p>}
            <Notes view={view} />
          </Section>
          {abilities.length > 0 && (
            <Section title="Day abilities">
              {abilities.map((a) => (
                <DayAction key={a.key} view={view} spec={a} />
              ))}
            </Section>
          )}
          <Usage seated={seated} />
          {travellers && <Travellers view={view} seated={seated} />}
          <HoldButton big variant="primary" disabled={pending} onConfirm={() => void run({ type: 'start_night' })}>
            Start Night {view.phase.n}
          </HoldButton>
        </div>
      </div>
    </div>
  );
}
