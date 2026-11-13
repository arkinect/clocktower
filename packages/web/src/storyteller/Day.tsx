import { useState, type ReactNode } from 'react';
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
import { Picker, choiceComplete, optionText } from '../ui/Picker';
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
  const chosen = chosenForExecution(view);
  return (
    <Section title={`Day ${view.phase.n}`}>
      <table className={styles['tbl']}>
        <tbody>
          {seated.map((p) => (
            <tr key={p.id}>
              <td>
                <Who view={view} id={p.id} role />
                {chosen === p.id && p.alive && <span className={styles['tag']}> executed at dusk</span>}
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
                    Kill
                  </Button>
                ) : p.ghostVoteUsed ? (
                  <span className={styles['tag']}>Dead vote used</span>
                ) : (
                  <Button
                    tiny
                    disabled={pending}
                    onClick={() => void run({ type: 'set_ghost_vote', playerId: p.id, used: true })}
                  >
                    Use dead vote
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

/** Today's choice of execution, if any: the last one recorded. */
const chosenForExecution = (view: StorytellerView) =>
  view.dayEvents.findLast((x) => x.kind === 'execution')?.playerId ?? null;

function Execution({ view, seated }: { view: StorytellerView; seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  const names = useNames();
  const chosen = chosenForExecution(view);
  const reminders = seated
    .flatMap((p) => p.abilities.map((a) => ({ p, a })))
    .filter(({ a }) => !a.perceivedOnly && a.active && a.dayReminder && a.reminder);
  return (
    <Section title="Execution">
      <label className={styles['field']}>
        <span>Executed</span>
        {/* Only a choice, changed as often as needed: the execution happens at Start Night. */}
        <select
          value={chosen ?? ''}
          disabled={pending}
          onChange={(e) =>
            void run({ type: 'record_execution', playerId: (e.target.value || null) as PlayerId | null, died: true })
          }
        >
          <option value="">No execution today</option>
          {seated
            .filter((p) => p.alive || p.id === chosen)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.character ? ` (${names.roles[p.character] ?? p.character})` : ''}
                {p.alive ? '' : ' (dead)'}
              </option>
            ))}
        </select>
      </label>
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

/** "Now" happens the moment it is confirmed. "Tonight" is only recorded: dusk or the night reads it. */
const when = (spec: DayActionSpec) => (spec.preview ? 'Now' : 'Tonight');

/** The select's "nothing happened" option. */
const emptyLabel = (spec: DayActionSpec) => spec.emptyLabel ?? (spec.fields[0]?.kind === 'player' ? 'No one' : 'No');

/** Every day event looks the same: its title, when it happens, its question, then its control. */
function EventFrame({ spec, children }: { spec: DayActionSpec; children: ReactNode }) {
  return (
    <article className={styles['event']}>
      <div className={styles['eventHead']}>
        <h3>{spec.title}</h3>
        <span className={styles['tag']}>{when(spec)}</span>
      </div>
      {spec.prompt && <p className="muted small">{spec.prompt}</p>}
      {children}
    </article>
  );
}

const sendDay = (
  run: ReturnType<typeof useCommand>['run'],
  spec: DayActionSpec,
  values: string[],
  mode: 'preview' | 'accept' | 'force_success' | 'force_fail' = 'accept',
  decisions: Decisions = [],
) =>
  run({
    type: 'day_action',
    abilityId: spec.abilityId,
    action: spec.action,
    values,
    mode,
    ...(decisions.length ? { decisions } : {}),
  });

/** Happens in the moment: choosing shows what it would do, and Confirm makes it happen. */
function NowEvent({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const field = spec.fields[0] as ActionField;
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const decisions: Decisions = (preview?.decisions ?? []).flatMap((d) => {
    const option = picked[JSON.stringify(d.key)];
    return option ? [{ key: d.key, option }] : [];
  });
  const go = async (mode: 'preview' | 'accept' | 'force_success' | 'force_fail', v: string) => {
    const ack = await sendDay(run, spec, [v], mode, decisions);
    if (!ack.ok) return;
    if (mode === 'preview') return setPreview(ack.data as Preview);
    setPreview(null);
    setValue('');
    setPicked({});
  };
  return (
    <EventFrame spec={spec}>
      <div className={styles['eventRow']}>
        <select
          aria-label={spec.title}
          value={value}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            setPreview(null);
            setPicked({});
            if (v) void go('preview', v);
          }}
        >
          <option value="">{emptyLabel(spec)}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {optionText(field, o, names, dead)}
            </option>
          ))}
        </select>
        <Button tiny variant="primary" disabled={!value || pending} onClick={() => void go('accept', value)}>
          Confirm
        </Button>
      </div>
      {preview && value && (
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
                onChange={(option) => setPicked({ ...picked, [JSON.stringify(d.key)]: option })}
              />
            </div>
          ))}
          <div className="row">
            <span className="muted small">Your ruling instead:</span>
            <Button tiny disabled={pending} onClick={() => void go('force_success', value)}>
              Make it work
            </Button>
            <Button tiny disabled={pending} onClick={() => void go('force_fail', value)}>
              Make it fail
            </Button>
          </div>
        </Card>
      )}
    </EventFrame>
  );
}

/** Waits for dusk or the night: whatever is chosen is recorded straight away, and can be changed until then. */
function TonightEvent({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const field = spec.fields[0] as ActionField;
  const recorded = spec.recorded?.[0] ?? null;
  const value = recorded ?? spec.default?.[0] ?? '';
  const empty = !spec.default && (spec.clearable || !recorded);
  return (
    <EventFrame spec={spec}>
      <select
        aria-label={spec.title}
        value={value}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          if (v) void sendDay(run, spec, [v]);
          else if (spec.clearable) void sendDay(run, spec, []);
        }}
      >
        {empty && <option value="">{emptyLabel(spec)}</option>}
        {field.options.map((o) => (
          <option key={o} value={o}>
            {optionText(field, o, names, dead)}
          </option>
        ))}
      </select>
      {spec.neededTonight && !spec.recorded && !spec.default && (
        <p className="muted small">Needed tonight. If you leave it, Review will ask for it.</p>
      )}
    </EventFrame>
  );
}

/**
 * A switch, with no confirm and no countdown: pressing it again undoes it. An option field is one switch (its options
 * are off, then on). A player field is one switch per player, on for those recorded.
 */
function ToggleEvent({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const field = spec.fields[0] as ActionField;
  if (field.kind === 'option') {
    const [off = '', on = ''] = field.options;
    const isOn = (spec.recorded?.[0] ?? spec.default?.[0] ?? off) === on;
    return (
      <EventFrame spec={spec}>
        <div className="row">
          <Button
            on={isOn}
            aria-pressed={isOn}
            disabled={pending}
            onClick={() => void sendDay(run, spec, [isOn ? off : on])}
          >
            {field.labels?.[on] ?? on}
          </Button>
        </div>
      </EventFrame>
    );
  }
  const onSet = new Set(spec.recorded ?? []);
  return (
    <EventFrame spec={spec}>
      <div className="row">
        {field.options.map((o) => (
          <Button
            key={o}
            on={onSet.has(o)}
            aria-pressed={onSet.has(o)}
            disabled={pending}
            onClick={() => void sendDay(run, spec, [o])}
          >
            {optionText(field, o, names, dead)}
          </Button>
        ))}
      </div>
    </EventFrame>
  );
}

const chunk = (values: string[], width: number) =>
  Array.from({ length: Math.floor(values.length / width) }, (_, i) => values.slice(i * width, i * width + width));

/** Up to `maxRows` rows of one value per field (the Juggler's guesses). A row is recorded once it is complete. */
function RowsEvent({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const width = spec.fields.length;
  const max = spec.maxRows ?? 1;
  const saved = chunk(spec.recorded ?? [], width);
  const blank = () => spec.fields.map(() => '');
  const [draft, setDraft] = useState<string[]>(blank);
  const save = (rows: string[][]) => void sendDay(run, spec, rows.flat());
  const cell = (
    f: ActionField,
    row: string[],
    i: number,
    label: string,
    onChange: (v: string) => void,
    first?: string,
  ) => (
    <select
      key={i}
      aria-label={label}
      value={row[i] ?? ''}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
    >
      {first !== undefined && <option value="">{first}</option>}
      {f.options.map((o) => (
        <option key={o} value={o}>
          {optionText(f, o, names, dead)}
        </option>
      ))}
    </select>
  );
  return (
    <EventFrame spec={spec}>
      {saved.map((row, r) => (
        <div key={r} className={styles['eventRow']}>
          {spec.fields.map((f, i) =>
            cell(f, row, i, `${f.label} ${r + 1}`, (v) =>
              save(saved.map((x, j) => (j === r ? x.map((y, k) => (k === i ? v : y)) : x))),
            ),
          )}
          <Button tiny disabled={pending} onClick={() => save(saved.filter((_, j) => j !== r))}>
            Remove
          </Button>
        </div>
      ))}
      {saved.length < max && (
        <div className={styles['eventRow']}>
          {spec.fields.map((f, i) =>
            cell(
              f,
              draft,
              i,
              `${f.label} ${saved.length + 1}`,
              (v) => {
                const next = draft.map((y, k) => (k === i ? v : y));
                if (next.every(Boolean)) {
                  save([...saved, next]);
                  setDraft(blank());
                } else setDraft(next);
              },
              `${f.label}…`,
            ),
          )}
        </div>
      )}
    </EventFrame>
  );
}

/** One row of the Day events list, drawn by its control and when it happens. */
export function DayEvent({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
  const control = spec.control ?? 'select';
  if (control === 'rows') return <RowsEvent view={view} spec={spec} />;
  // Several fields at once need the full form. No role has one.
  if (spec.fields.length !== 1) return <DayAction view={view} spec={spec} />;
  if (control === 'toggle') return <ToggleEvent view={view} spec={spec} />;
  return spec.preview ? <NowEvent view={view} spec={spec} /> : <TonightEvent view={view} spec={spec} />;
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
              Remove
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
  // In roughly the order a day goes: public statements and abilities, then nominations and votes.
  const events = [...view.dayActions].sort(
    (a, b) => (a.order ?? 1000) - (b.order ?? 1000) || a.title.localeCompare(b.title),
  );
  const blocked = view.dayActions.some((a) => a.blocksNight && !a.recorded);
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
          <Section title="Day events">
            {events.map((a) => (
              <DayEvent key={a.key} view={view} spec={a} />
            ))}
            {!events.length && <p className="muted">No character needs anything recorded today.</p>}
            <Notes view={view} />
          </Section>
          <Usage seated={seated} />
          {travellers && <Travellers view={view} seated={seated} />}
          <HoldButton
            big
            variant="primary"
            disabled={blocked || pending}
            onConfirm={() => void run({ type: 'start_night' })}
          >
            Start Night {view.phase.n}
          </HoldButton>
          {blocked && (
            <>
              <HoldButton onConfirm={() => void run({ type: 'start_night', force: true })}>
                Force start night
              </HoldButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
