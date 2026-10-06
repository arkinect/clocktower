// Admin-only story of the game: per night, every player's role, impairment and targets; per day, deaths.
import { useState } from 'react';
import { ROLE_BY_ID } from '@ct/shared';
import type { AdminCtx } from './AdminApp';
import { ImpairmentTags } from '../common';


export function StoryPanel({ ctx }: { ctx: AdminCtx }) {
  const { s, names } = ctx;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!s.story?.length) return <div className="card"><p className="muted">The story starts when Night 0 is published.</p></div>;
  // Chronological: Night 0, Day 1, Night 1, … so the whole game reads top to bottom.
  const entries = s.story;
  return (
    <div>
      {entries.map((e) => {
        const key = e.kind === 'night' ? `n${e.night}` : `d${e.day}`;
        const isOpen = open[key] ?? true;
        if (e.kind === 'day') {
          return (
            <section key={key} className="card story-day">
              <h2 onClick={() => setOpen({ ...open, [key]: !isOpen })} className="clickable">☀ Day {e.day}</h2>
              <p>Execution: {e.executedPlayerId ? <span className="dead-name">{names[e.executedPlayerId]}</span> : 'none'}</p>
              <p>Died during the day: {e.deaths.length ? e.deaths.map((d, i) => <span key={d.playerId} className="dead-name">{i ? ', ' : ''}{names[d.playerId]}{d.cause ? ` (${d.cause.replace(/_/g, ' ')})` : ''}</span>) : 'nobody'}</p>
              {e.notes && <p className="muted">Notes: {e.notes}</p>}
            </section>
          );
        }
        return (
          <section key={key} className="card">
            <h2 onClick={() => setOpen({ ...open, [key]: !isOpen })} className="clickable">☾ Night {e.night} {isOpen ? '▾' : '▸'}</h2>
            <p>
              Deaths: {e.deaths.length ? <span className="dead-name">{e.deaths.map((d) => names[d]).join(', ')}</span> : 'none'}
              {e.revived.length > 0 && <> · Revived: {e.revived.map((d) => names[d]).join(', ')}</>}
            </p>
            {isOpen && (
              <div className="board">
                <table className="tbl story">
                  <thead><tr><th>#</th><th>Player</th><th>Role</th><th>Drunk / poisoned</th><th>Targets and outcome</th><th>Information received</th></tr></thead>
                  <tbody>
                    {e.players.map((p) => (
                      <tr key={p.playerId} className={p.aliveAtStart ? '' : 'deadrow'}>
                        <td className="muted">{p.seat !== null ? p.seat + 1 : ''}</td>
                        <td>
                          <span className={p.aliveAtEnd ? undefined : 'dead-name'}>{p.name}</span>
                          {!p.aliveAtStart ? <span className="muted small"> (dead)</span> : !p.aliveAtEnd ? <span className="small dead-name"> (died)</span> : null}
                        </td>
                        <td>
                          <span className={`type-${ROLE_BY_ID[p.roleId ?? '']?.type ?? ''}`}>{p.roleId ? ROLE_BY_ID[p.roleId]?.name : '—'}</span>
                          {p.believedRoleId && <span className="muted small"> thinks {ROLE_BY_ID[p.believedRoleId]?.name}</span>}
                          <span className={`small ${p.alignment === 'evil' ? 'bad' : 'muted'}`}> · {p.alignment}</span>
                        </td>
                        <td>{p.impaired ? <ImpairmentTags causes={p.causes} /> : <span className="muted">sober</span>}</td>
                        <td className="small">
                          {p.actions.length ? p.actions.map((a, i) => (
                            <div key={i}><b>{ROLE_BY_ID[a.roleId]?.name ?? a.slot}:</b> {a.input}{a.outcome ? <span className="muted"> → {a.outcome}</span> : null}</div>
                          )) : <span className="muted">—</span>}
                        </td>
                        <td className="small">
                          {p.received === undefined ? <span className="muted">(not recorded)</span>
                            : p.received.length ? p.received.map((m, i) => (
                              <div key={i}>
                                <b>{m.title}:</b> {m.lines.join(' ')}
                                {m.trueLines && <div className="bad">Truth: {m.trueLines.join(' ')}</div>}
                              </div>
                            )) : <span className="muted">nothing</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
