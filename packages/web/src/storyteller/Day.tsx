import { useState } from 'react';
import type {
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
import { PlayerSelect, Section, Who, useSeats } from './common';
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
function DayAction({ view, spec }: { view: StorytellerView; spec: DayActionSpec }) {
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

function Events({ view, seated }: { view: StorytellerView; seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  const [nominator, setNominator] = useState<PlayerId | ''>('');
  const [nominee, setNominee] = useState<PlayerId | ''>('');
  const [count, setCount] = useState('');
  const [executed, setExecuted] = useState<PlayerId | ''>('');
  const [speaker, setSpeaker] = useState<PlayerId | ''>('');
  const [statement, setStatement] = useState('');
  const [mad, setMad] = useState<PlayerId | ''>('');
  const [ruling, setRuling] = useState('');
  return (
    <Section title="Nominations and executions">
      <div className={styles['formRow']}>
        <PlayerSelect label="Nominator" players={seated} value={nominator} onChange={setNominator} />
        <PlayerSelect label="Nominee" players={seated} value={nominee} onChange={setNominee} />
        <Button
          tiny
          disabled={!nominator || !nominee || pending}
          onClick={() => {
            if (nominator && nominee) void run({ type: 'record_nomination', nominator, nominee });
          }}
        >
          Record nomination
        </Button>
      </div>
      <div className={styles['formRow']}>
        <label className={styles['field']}>
          <span>Votes (optional)</span>
          <input type="number" min={0} max={40} value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <Button
          tiny
          disabled={!nominee || pending}
          onClick={() => {
            if (nominee) {
              void run({ type: 'record_vote', nominee, count: count === '' ? null : Number(count), voters: null });
            }
          }}
        >
          Record vote for nominee
        </Button>
      </div>
      <div className={styles['formRow']}>
        <PlayerSelect label="Executed" players={seated} value={executed} onChange={setExecuted} none="Nobody" />
        <HoldButton
          disabled={pending}
          onConfirm={() => void run({ type: 'record_execution', playerId: executed || null, died: true })}
        >
          Execute
        </HoldButton>
        <Button
          tiny
          disabled={pending}
          onClick={() => void run({ type: 'record_execution', playerId: executed || null, died: false })}
        >
          Executed, did not die
        </Button>
      </div>
      <div className={styles['formRow']}>
        <PlayerSelect label="Statement by" players={seated} value={speaker} onChange={setSpeaker} />
        <label className={styles['field']}>
          <span>Statement</span>
          <input value={statement} maxLength={500} onChange={(e) => setStatement(e.target.value)} />
        </label>
        <Button
          tiny
          disabled={!speaker || !statement.trim() || pending}
          onClick={() => {
            if (speaker) void run({ type: 'record_statement', playerId: speaker, text: statement.trim() });
            setStatement('');
          }}
        >
          Record statement
        </Button>
      </div>
      <div className={styles['formRow']}>
        <PlayerSelect label="Broke madness" players={seated} value={mad} onChange={setMad} />
        <label className={styles['field']}>
          <span>Your ruling</span>
          <input value={ruling} maxLength={200} onChange={(e) => setRuling(e.target.value)} />
        </label>
        <Button
          tiny
          disabled={!mad || !ruling.trim() || pending}
          onClick={() => {
            if (mad) void run({ type: 'record_broke_madness', playerId: mad, ruling: ruling.trim() });
            setRuling('');
          }}
        >
          Record ruling
        </Button>
      </div>
      <ol className={styles['events']}>
        {view.dayEvents.map((e, i) => (
          <li key={i}>
            <span className="muted small">{e.kind}</span> {e.text}
          </li>
        ))}
      </ol>
      {!view.dayEvents.length && <p className="muted">Nothing recorded today.</p>}
    </Section>
  );
}

function Lives({ view, seated }: { view: StorytellerView; seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  return (
    <Section title="Players">
      <ul className={styles['rows']}>
        {seated.map((p) => (
          <li key={p.id}>
            <span className={styles['grow']}>
              <Who view={view} id={p.id} role />
              {p.impaired ? <span className={styles['warn']}> impaired</span> : null}
            </span>
            {!p.alive && (
              <Button
                tiny
                disabled={pending}
                onClick={() => void run({ type: 'set_ghost_vote', playerId: p.id, used: !p.ghostVoteUsed })}
              >
                {p.ghostVoteUsed ? 'Vote used' : 'Vote left'}
              </Button>
            )}
            <Button
              tiny
              disabled={pending}
              onClick={() => void run({ type: 'mark_alive', playerId: p.id, alive: !p.alive })}
            >
              {p.alive ? 'Mark dead' : 'Revive'}
            </Button>
          </li>
        ))}
      </ul>
    </Section>
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

function Usage({ seated }: { seated: GrimoirePlayer[] }) {
  const { run, pending } = useCommand();
  const held = seated.flatMap((p) => p.abilities.map((a) => ({ p, a }))).filter(({ a }) => a.oncePerGame);
  const reminders = seated.flatMap((p) => p.abilities.map((a) => ({ p, a }))).filter(({ a }) => a.reminder && a.active);
  if (!held.length && !reminders.length) return null;
  return (
    <Section title="Abilities">
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
      {reminders.map(({ p, a }) => (
        <p key={a.id} className="small">
          <b>{a.name}</b> ({p.name}): {a.reminder}
        </p>
      ))}
    </Section>
  );
}

function Notes({ view }: { view: StorytellerView }) {
  const { run } = useCommand();
  return (
    <Section title="Notes">
      <textarea
        key={view.notes}
        aria-label="Notes"
        rows={4}
        maxLength={2000}
        defaultValue={view.notes}
        onBlur={(e) => {
          if (e.target.value !== view.notes) void run({ type: 'set_notes', text: e.target.value });
        }}
      />
    </Section>
  );
}

export function Day({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const { seated } = useSeats(view);
  if (view.phase.kind !== 'day') return <Card>It is not day.</Card>;
  return (
    <div>
      {view.gameEnd.map((g) => (
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
          <Events view={view} seated={seated} />
          {view.dayActions.length > 0 && (
            <Section title="Day actions">
              {view.dayActions.map((a) => (
                <DayAction key={a.key} view={view} spec={a} />
              ))}
            </Section>
          )}
        </div>
        <div>
          <Lives view={view} seated={seated} />
          <Usage seated={seated} />
          <Travellers view={view} seated={seated} />
          <Notes view={view} />
        </div>
      </div>
      <HoldButton variant="primary" disabled={pending} onConfirm={() => void run({ type: 'start_night' })}>
        Start the night
      </HoldButton>
    </div>
  );
}
