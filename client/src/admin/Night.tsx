import { useMemo, useState } from 'react';
import { ROLE_BY_ID, type ActionChoice, type ResultRow } from '@ct/shared';
import { send } from '../api';
import { ActionPicker, Countdown, ImpairmentTags, TimedButton, choiceComplete, useNow } from '../common';
import { Who, type AdminCtx } from './AdminApp';

function describe(ctx: AdminCtx, actions: Record<string, ActionChoice> | undefined): string {
  if (!actions || !Object.keys(actions).length) return 'acknowledged';
  return Object.entries(actions).map(([k, c]) => {
    const v = c.decline ? 'no one / not tonight' : c.values.map((x) => ctx.names[x] ?? ROLE_BY_ID[x]?.name ?? x).join(', ');
    return `${ROLE_BY_ID[k]?.name ?? k}: ${v}`;
  }).join(' · ');
}

export function NightPanel({ ctx }: { ctx: AdminCtx }) {
  const { s, view, names, seated } = ctx;
  const [proxy, setProxy] = useState<string | null>(null);
  const offset = useMemo(() => view.serverNow - Date.now(), [view.serverNow]);
  const nowLocal = useNow(1000);
  if (!s.phase.startsWith('NIGHT') || !s.night) {
    return (
      <div className="card">
        <p>No night in progress.</p>
        {s.phase === 'DAY' && <TimedButton className="primary big" onConfirm={() => send({ type: 'start_night' })}>Start Night {s.nightNumber + 1}</TimedButton>}
      </div>
    );
  }
  const night = s.night;
  const expected = new Set(view.expectedActors);
  const pending = view.expectedActors.filter((id) => !night.submissions[id]);
  const timeUp = s.nightEndsAt !== null && nowLocal + offset >= s.nightEndsAt;
  const collecting = s.phase === 'NIGHT_COLLECTING';

  return (
    <div>
      <section className="card nightctl">
        <div className="row wrap">
          <h2>Night {night.number}</h2>
          {night.collectingOpen && <Countdown endsAt={s.nightEndsAt} offset={offset} />}
          {night.collectingOpen && collecting && (
            <>
              <button onClick={() => send({ type: 'extend_countdown', seconds: 60 })}>+1 min</button>
              <button onClick={() => send({ type: 'extend_countdown', seconds: 180 })}>+3 min</button>
              <button onClick={() => { const v = prompt('Countdown seconds (also the default for later nights)', String(s.settings.countdownSeconds)); if (v) send({ type: 'set_countdown', seconds: Number(v) }); }}>Set…</button>
            </>
          )}
        </div>
        {collecting && !night.collectingOpen && (
          <div>
            <p>Players are looking at their roles. Seen: {seated.filter((id) => s.players.find((p) => p.id === id)?.hasSeenRole).length}/{seated.length}</p>
            <TimedButton className="primary big" onConfirm={() => send({ type: 'start_collecting' })}>Start collecting</TimedButton>
          </div>
        )}
        {collecting && night.collectingOpen && (
          <div className="row wrap">
            <span>{expected.size - pending.length}/{expected.size} submitted.</span>
            <button className="primary big" disabled={pending.length > 0 && !timeUp} onClick={() => send({ type: 'resolve_night' })}>Resolve night</button>
            {pending.length > 0 && !timeUp && <TimedButton className="danger" onConfirm={() => send({ type: 'resolve_night', force: true })}>Force resolve</TimedButton>}
          </div>
        )}
        {night.number >= 1 && seated.some((id) => ctx.roleOf(id) === 'godfather' || s.assignments[id]?.grantedAbility?.roleId === 'godfather') && (
          <div className="row wrap">
            <span>Godfather may kill tonight: <b>{view.godfatherTriggered ? 'yes' : 'no'}</b>{night.reviewChoices['godfather_trigger'] ? ' (your choice)' : ' (an Outsider died today?)'}</span>
            <button onClick={() => send({ type: 'set_godfather_trigger', value: !view.godfatherTriggered })}>Flip</button>
            {night.reviewChoices['godfather_trigger'] && <button onClick={() => send({ type: 'set_godfather_trigger', value: null })}>Use rule</button>}
          </div>
        )}
        {s.phase === 'NIGHT_RESOLVING' && <p>Resolving. Go to the Review tab. <button onClick={() => send({ type: 'reopen_collecting' })}>Reopen collecting</button></p>}
        {timeUp && collecting && night.collectingOpen && <div className="warnline">Time is up. Nothing happens automatically.</div>}
      </section>

      <table className="tbl board">
        <thead><tr><th></th><th>Player</th><th>Role</th><th>Wakes as</th><th>Status</th><th>Choice</th><th></th></tr></thead>
        <tbody>
          {seated.map((id) => {
            const p = s.players.find((x) => x.id === id)!;
            const a = s.assignments[id];
            const sub = night.submissions[id];
            const acts = view.actorActions[id] ?? [];
            return (
              <tr key={id} className={!p.alive ? 'deadrow' : ''}>
                <td><span className={`dot ${view.presence[id] ? 'on' : ''}`} /></td>
                <td><Who ctx={ctx} id={id} /></td>
                <td>{a?.roleId ? ROLE_BY_ID[a.roleId].name : '—'}{a?.believedRoleId ? <span className="muted"> (thinks {ROLE_BY_ID[a.believedRoleId].name})</span> : null}</td>
                <td>{acts.map((x) => x.title).join(', ') || <span className="muted">—</span>}</td>
                <td>
                  {!night.collectingOpen ? (p.hasSeenRole ? <span className="ok">seen role ✓</span> : <span className="pending">viewing role…</span>)
                    : !expected.has(id) ? <span className="muted">not required</span> : sub ? <span className="ok">✓ {sub.byAdmin ? '(by you)' : ''}</span> : <span className="pending">pending</span>}
                </td>
                <td className="small">{sub ? describe(ctx, sub.actions) : ''}</td>
                <td className="right">
                  {collecting && night.collectingOpen && (
                    <span className="btnrow">
                      <button onClick={() => setProxy(id)}>Act</button>
                      {sub && <button onClick={() => send({ type: 'clear_submission', playerId: id })}>Clear</button>}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {proxy && <ProxySubmit ctx={ctx} pid={proxy} onClose={() => setProxy(null)} />}
    </div>
  );
}

function ProxySubmit({ ctx, pid, onClose }: { ctx: AdminCtx; pid: string; onClose: () => void }) {
  const specs = ctx.view.actorSpecs[pid] ?? [];
  const [value, setValue] = useState<Record<string, ActionChoice>>(ctx.s.night?.submissions[pid]?.actions ?? {});
  const complete = specs.every((sp) => choiceComplete(sp, value[sp.key]));
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheetbody" onClick={(e) => e.stopPropagation()}>
        <h3>Act for <Who ctx={ctx} id={pid} /></h3>
        {specs.length ? <ActionPicker specs={specs} names={ctx.names} value={value} onChange={setValue} dead={new Set(ctx.seated.filter(ctx.isDead))} /> : <p className="muted">This player has no choice tonight. Submitting records an acknowledgement.</p>}
        <div className="row">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!complete} onClick={async () => { const r = await send({ type: 'submit_for', playerId: pid, actions: value }); if (r.ok) onClose(); }}>Submit</button>
        </div>
      </div>
    </div>
  );
}

export function ReviewPanel({ ctx }: { ctx: AdminCtx }) {
  const { s, names, label } = ctx;
  const res = s.night?.resolution;
  if (s.phase !== 'NIGHT_RESOLVING' || !res || !s.night) return <div className="card"><p>Nothing to review. Resolve the night from the Night tab.</p></div>;
  const night = s.night;
  const open = res.reviewItems.filter((i) => i.chosen === null).length;
  return (
    <div>
      <section className="card">
        <div className="row wrap">
          <h2>Review Night {night.number}</h2>
          <button onClick={() => send({ type: 'accept_all_defaults' })}>Accept all defaults{open ? ` (${open})` : ''}</button>
          <button onClick={() => send({ type: 'reopen_collecting' })}>Reopen collecting</button>
          {/* Publishing while the Ravenkeeper has not chosen sends them no information. */}
          <TimedButton className="primary big" onConfirm={() => send({ type: 'publish_night', force: res.awaitingRavenkeeper.length > 0 })}>Publish and send to Day</TimedButton>
        </div>
        {res.deaths.length > 0 ? <p>Deaths tonight: <b className="dead-name">{res.deaths.map((d) => names[d]).join(', ')}</b></p> : <p>No deaths tonight.</p>}
        {res.revived.length > 0 && <p>Revived: {res.revived.map((d) => names[d]).join(', ')}</p>}
      </section>

      {res.awaitingRavenkeeper.map((rk) => <RavenWait key={rk} ctx={ctx} pid={rk} />)}

      {res.reviewItems.length > 0 && (
        <section className="card">
          <h2>Decisions</h2>
          {res.reviewItems.map((it) => (
            <div key={it.key} className={`review ${it.chosen === null ? 'open' : ''}`}>
              <div><b>{it.title}</b> <span className="muted small">{it.description}</span></div>
              <select value={it.chosen ?? it.default} onChange={(e) => send({ type: 'choose_review', key: it.key, optionId: e.target.value })}>
                {it.options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.id === it.default ? ' (recommended)' : ''}</option>)}
              </select>
              {it.chosen === null ? <button onClick={() => send({ type: 'choose_review', key: it.key, optionId: it.default })}>Accept</button> : <span className="ok small">✓ decided</span>}
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Information to send</h2>
        {res.results.length === 0 && <p className="muted">No information roles acted.</p>}
        {res.results.map((r) => <ResultEditor key={r.key} ctx={ctx} r={r} />)}
        <p className="muted small">Everyone else will see "You learned nothing." Notices: {res.notices.map((n) => `${names[n.playerId]}: ${n.title}`).join('; ') || 'none'}.</p>
      </section>

      <MathAdjust ctx={ctx} />

      <section className="card">
        <h2>Night walk</h2>
        <table className="tbl">
          <thead><tr><th>Slot</th><th>Player</th><th>Input</th><th>Impaired</th><th>Outcome</th></tr></thead>
          <tbody>
            {res.actors.map((a, i) => (
              <tr key={i}>
                <td>{a.slot}</td>
                <td><Who ctx={ctx} id={a.playerId} role /></td>
                <td>{a.input}</td>
                <td>{a.impaired ? <ImpairmentTags causes={a.causes} /> : <span className="muted">no</span>}</td>
                <td className="small">{a.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ResultEditor({ ctx, r }: { ctx: AdminCtx; r: ResultRow }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(r.finalLines.join('\n'));
  return (
    <div className={`result ${r.impaired ? 'impaired' : ''}`}>
      <div className="row wrap">
        <b><Who ctx={ctx} id={r.playerId} role /></b>
        <span className="muted">as {ROLE_BY_ID[r.roleId]?.name}</span>
        {r.impaired && <ImpairmentTags causes={r.causes} />}
        {r.overridden && <span className="tag">edited</span>}
      </div>
      <div className="small">True: {r.trueLines.join(' ')}</div>
      {r.impaired && <div className="small">Suggested: {r.suggestedLines.join(' ')}</div>}
      <div className="final">Will send: <b>{r.finalLines.join(' ')}</b></div>
      <div className="row wrap">
        {r.alternatives.length > 0 && (
          <select value="" onChange={(e) => { if (e.target.value !== '') send({ type: 'override_result', key: r.key, lines: r.alternatives[Number(e.target.value)] }); }}>
            <option value="">Quick pick…</option>
            {r.alternatives.map((alt, i) => <option key={i} value={i}>{alt.join(' ')}</option>)}
          </select>
        )}
        <button onClick={() => { setText(r.finalLines.join('\n')); setEditing(!editing); }}>Edit text</button>
        {r.overridden && <button onClick={() => send({ type: 'override_result', key: r.key, lines: null })}>Reset</button>}
      </div>
      {editing && (
        <div>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="primary" onClick={async () => { const res = await send({ type: 'override_result', key: r.key, lines: text.split('\n').filter(Boolean) }); if (res.ok) setEditing(false); }}>Save</button>
        </div>
      )}
    </div>
  );
}

function RavenWait({ ctx, pid }: { ctx: AdminCtx; pid: string }) {
  const [t, setT] = useState('');
  return (
    <section className="card warn">
      <h3>Waiting for Ravenkeeper <Who ctx={ctx} id={pid} /></h3>
      <p>Their phone is showing "You have died. Choose a player". Or choose for them:</p>
      <div className="row">
        <select value={t} onChange={(e) => setT(e.target.value)}>
          <option value="">Choose…</option>
          {ctx.seated.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.names[id]}</option>)}
        </select>
        <button disabled={!t} onClick={() => send({ type: 'ravenkeeper_for', playerId: pid, targetId: t })}>Submit for them</button>
      </div>
    </section>
  );
}

function MathAdjust({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated } = ctx;
  const res = s.night!.resolution!;
  const hasMath = res.results.some((r) => r.roleId === 'mathematician');
  if (!hasMath) return null;
  const adj = s.night!.mathAdjust;
  const auto = [...new Set(res.abnormal.map((e) => e.playerId))];
  const toggleRemove = (id: string) => send({ type: 'math_adjust', add: adj.add, remove: adj.remove.includes(id) ? adj.remove.filter((x) => x !== id) : [...adj.remove, id] });
  const toggleAdd = (id: string) => send({ type: 'math_adjust', add: adj.add.includes(id) ? adj.add.filter((x) => x !== id) : [...adj.add, id], remove: adj.remove });
  return (
    <section className="card">
      <h2>Mathematician: abnormal abilities</h2>
      <ul>
        {res.abnormal.map((e, i) => <li key={i}><Who ctx={ctx} id={e.playerId} />: {e.detail} <span className="muted small">({e.cause})</span></li>)}
        {!res.abnormal.length && <li className="muted">None detected.</li>}
      </ul>
      <div className="row wrap">
        {auto.map((id) => <label key={id} className="check"><input type="checkbox" checked={!adj.remove.includes(id)} onChange={() => toggleRemove(id)} /> count <Who ctx={ctx} id={id} /></label>)}
      </div>
      <div className="row wrap">
        <span className="small">Add:</span>
        {seated.filter((id) => !auto.includes(id)).map((id) => <label key={id} className="check"><input type="checkbox" checked={adj.add.includes(id)} onChange={() => toggleAdd(id)} /> <Who ctx={ctx} id={id} /></label>)}
      </div>
    </section>
  );
}
