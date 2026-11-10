import { Fragment, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { PlayerId, StoryDay, StoryNight, StorytellerView } from '@ct/protocol';
import { useGame, useNames } from '../app/store';
import { Button } from '../ui/ui';
import { Section, causeLabel } from './common';
import styles from './console.module.css';

const plain = (cause: string) => cause.replaceAll('_', ' ');

/** Names in red, comma separated, or a word for none. */
function DeadNames({ ids, none }: { ids: PlayerId[]; none: string }) {
  const names = useNames();
  if (!ids.length) return <>{none}</>;
  return <span className={styles['dead']}>{ids.map((id) => names.players[id] ?? id).join(', ')}</span>;
}

function DayCard({ day }: { day: StoryDay }) {
  const names = useNames();
  const who = (id: PlayerId) => names.players[id] ?? id;
  let execution: ReactNode = 'none';
  if (day.execution?.playerId) {
    execution = <span className={styles['dead']}>{who(day.execution.playerId)}</span>;
  }
  return (
    <section className={styles['section']}>
      <h2>☀ Day {day.n}</h2>
      <p>Execution: {execution}</p>
      <p>
        Died during the day:{' '}
        {day.deaths.length
          ? day.deaths.map((d, i) => (
              <Fragment key={`${d.playerId}:${i}`}>
                {i > 0 ? ', ' : ''}
                <span className={styles['dead']}>{who(d.playerId)}</span> ({plain(d.cause)})
              </Fragment>
            ))
          : 'nobody'}
      </p>
      {day.other.length > 0 && <p>Other: {day.other.join(' ')}</p>}
      {day.notes && <p className="muted">Notes: {day.notes}</p>}
    </section>
  );
}

/** A night at a glance, as in 0.4.2: one row per player, scanned down and across. */
function NightCard({ night }: { night: StoryNight }) {
  const names = useNames();
  const { catalog } = useGame();
  const [open, setOpen] = useState(true);
  const role = (id: string | null) => (id ? (names.roles[id] ?? id) : '—');
  const type = (id: string | null) => catalog.find((c) => c.roleId === id)?.type;
  return (
    <section className={styles['section']}>
      <h2>
        <button type="button" className={styles['fold']} aria-expanded={open} onClick={() => setOpen(!open)}>
          ☾ Night {night.n} {open ? '▾' : '▸'}
        </button>
      </h2>
      <p>
        Deaths: <DeadNames ids={night.deaths} none="none" />
        {night.revived.length > 0 && <> · Revived: {night.revived.map((id) => names.players[id] ?? id).join(', ')}</>}
      </p>
      {open && (
        <div className={styles['board']}>
          <table className={`${styles['tbl']} ${styles['story']}`}>
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Role</th>
                <th>Drunk / poisoned</th>
                <th>Targets and outcome</th>
                <th>Information received</th>
              </tr>
            </thead>
            <tbody>
              {night.rows.map((p) => (
                <tr key={p.playerId} className={p.aliveAtStart ? undefined : styles['deadRow']}>
                  <td className="muted">{p.seat + 1}</td>
                  <td>
                    <span className={p.aliveAtEnd ? undefined : styles['dead']}>{p.name}</span>
                    {!p.aliveAtStart ? (
                      <span className="muted small"> (dead)</span>
                    ) : !p.aliveAtEnd ? (
                      <span className={`small ${styles['dead']}`}> (died)</span>
                    ) : null}
                  </td>
                  <td>
                    <span className={`type-${type(p.character) ?? ''}`}>{role(p.character)}</span>
                    {p.believed && <span className="muted small"> thinks {role(p.believed)}</span>}
                    <span className={`small ${p.alignment === 'evil' ? styles['dead'] : 'muted'}`}>
                      {' '}
                      · {p.alignment}
                    </span>
                  </td>
                  <td>
                    {p.causes.length ? (
                      <span className={styles['chips']}>
                        {p.causes.map((c) => (
                          <span key={c} className={styles['chip']}>
                            {causeLabel(c)}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="muted">sober</span>
                    )}
                  </td>
                  <td>
                    {p.actions.length ? (
                      p.actions.map((a, i) => (
                        <div key={i}>
                          <b>{a.roleId ? role(a.roleId) : a.slot}:</b> {a.input}
                          {a.outcome ? <span className="muted"> → {a.outcome}</span> : null}
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {p.received.length ? (
                      p.received.map((m, i) => (
                        <div key={i}>
                          <b>{m.title}:</b> {m.lines.join(' ')}
                          {m.truth && <div className={styles['dead']}>Truth: {m.truth.join(' ')}</div>}
                        </div>
                      ))
                    ) : (
                      <span className="muted">nothing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Story({ view }: { view: StorytellerView }) {
  if (!view.story.length) return <p className="muted">The story starts when Night 0 is published.</p>;
  return (
    <div>
      {view.story.map((e) =>
        e.kind === 'day' ? <DayCard key={`d${e.n}`} day={e} /> : <NightCard key={`n${e.n}`} night={e} />,
      )}
    </div>
  );
}

interface Exported {
  engineVersion: number;
  log: { now: number; actor: string | null; command: { type: string } & Record<string, unknown> }[];
}

const clock = (at: number) => new Date(at).toLocaleTimeString();

/** Downloads the command log, which is what a bug report needs to replay the game. */
export function reportProblem(code: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `clocktower-${code}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// The log is not in the view, on purpose: it grows through the night. It comes from the same export a bug report uses.
export function Log({ view }: { view: StorytellerView }) {
  const names = useNames();
  const [data, setData] = useState<Exported | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/g/${encodeURIComponent(view.code)}/export`).catch(() => null);
    if (res?.ok) setData((await res.json()) as Exported);
    else setError('The log could not be loaded.');
  }, [view.code]);
  useEffect(() => {
    void load();
  }, [load]);
  const rows = data?.log ?? [];
  return (
    <Section title={`Command log (${rows.length})`}>
      <div className="row">
        <Button tiny onClick={() => void load()}>
          Refresh
        </Button>
        <Button tiny disabled={!data} onClick={() => reportProblem(view.code, data)}>
          Report a problem
        </Button>
      </div>
      {error && <p className="error">{error}</p>}
      <ol className={styles['events']}>
        {[...rows].reverse().map((e, i) => {
          const { type, ...args } = e.command;
          const detail = JSON.stringify(args);
          return (
            <li key={i}>
              <span className="muted small">{clock(e.now)}</span> <b>{type.replace(/_/g, ' ')}</b>{' '}
              {e.actor ? (names.players[e.actor] ?? 'Storyteller') : ''}
              {detail !== '{}' && <code className={styles['mono']}> {detail}</code>}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
