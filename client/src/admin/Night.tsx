import { useMemo, useState } from 'react';
import { abilitiesOf, ROLE_BY_ID, storytellerLabel, type ActionChoice, type FollowUp, type ResultRow } from '@ct/shared';
import { send } from '../api';
import { ActionPicker, Countdown, ImpairmentTags, InputSheet, StableLabel, TimedButton, choiceComplete, useNow } from '../common';
import { InactiveNote, Who, type AdminCtx } from './AdminApp';

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
  const [settingTime, setSettingTime] = useState(false);
  const offset = useMemo(() => view.serverNow - Date.now(), [view.serverNow]);
  const nowLocal = useNow(1000);
  if (!s.phase.startsWith('NIGHT') || !s.night) {
    return <InactiveNote s={s} what="No night in progress." />;
  }
  const night = s.night;
  const expected = new Set(view.expectedActors);
  const pending = view.expectedActors.filter((id) => !night.submissions[id]);
  const timeUp = s.nightEndsAt !== null && nowLocal + offset >= s.nightEndsAt;
  const collecting = s.phase === 'NIGHT_COLLECTING';
  const count = `${expected.size - pending.length}/${expected.size}`;

  return (
    <div>
      <section className="card">
        <div className="row wrap">
          <h2>Night {night.number}</h2>
          {night.collectingOpen && <Countdown endsAt={s.nightEndsAt} offset={offset} />}
          {night.collectingOpen && collecting && (
            <>
              <button onClick={() => send({ type: 'extend_countdown', seconds: 60 })}>+1 min</button>
              <button onClick={() => send({ type: 'extend_countdown', seconds: 180 })}>+3 min</button>
              <button onClick={() => setSettingTime(true)}>Set…</button>
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
          <>
            <div className="submitted">
              <StableLabel
                labels={[<>{count} submitted.</>, <>{count} submitted · <span className="pending">Time is up. Nothing happens automatically.</span></>]}
                current={timeUp ? 1 : 0}
              />
            </div>
            <div className="row actions">
              <button className="primary big" disabled={pending.length > 0 && !timeUp} onClick={() => send({ type: 'resolve_night' })}>Resolve night</button>
              {pending.length > 0 && !timeUp && <TimedButton className="danger" onConfirm={() => send({ type: 'resolve_night', force: true })}>Force resolve</TimedButton>}
            </div>
          </>
        )}
        {night.number >= 1 && seated.some((id) => abilitiesOf(s, id, Infinity).some((x) => x.real && x.roleId === 'godfather')) && (
          <div className="row wrap">
            <span>Godfather may kill tonight: <b>{view.godfatherTriggered ? 'yes' : 'no'}</b>{night.reviewChoices['godfather_trigger'] ? ' (your choice)' : ' (an Outsider died today?)'}</span>
            <button onClick={() => send({ type: 'set_godfather_trigger', value: !view.godfatherTriggered })}>Flip</button>
            {night.reviewChoices['godfather_trigger'] && <button onClick={() => send({ type: 'set_godfather_trigger', value: null })}>Use rule</button>}
          </div>
        )}
        {s.phase === 'NIGHT_RESOLVING' && <p>Resolving. Go to the Review tab.</p>}
      </section>

      <section className="card">
        <h2>Players</h2>
        <div className="board">
          <table className="tbl nightboard">
        <colgroup>
          <col style={{ width: '28px' }} /><col style={{ width: '130px' }} /><col style={{ width: '150px' }} /><col style={{ width: '120px' }} /><col style={{ width: '130px' }} /><col /><col style={{ width: '150px' }} />
        </colgroup>
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
        </div>
      </section>
      {proxy && <ProxySubmit ctx={ctx} pid={proxy} onClose={() => setProxy(null)} />}
      {settingTime && (
        <InputSheet title="Set countdown" label="Countdown seconds (also the default for later nights)" type="number" initial={String(s.settings.countdownSeconds)} onClose={() => setSettingTime(false)}
          onSave={(v) => send({ type: 'set_countdown', seconds: Number(v) })} />
      )}
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
        <div className="sheet-actions">
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
  if (s.phase !== 'NIGHT_RESOLVING' || !res || !s.night) return <InactiveNote s={s} what="No night to review." />;
  const night = s.night;
  const open = res.reviewItems.filter((i) => i.chosen === null).length;
  return (
    <div>
      <section className="card">
        <div className="row wrap">
          <h2>Review Night {night.number}</h2>
          <button onClick={() => send({ type: 'accept_all_defaults' })}>Accept all defaults</button>
          <button onClick={() => send({ type: 'reopen_collecting' })}>Reopen collecting</button>
          {/* Publishing with a follow-up question unanswered (e.g. the Ravenkeeper's) sends that player no information. */}
          <TimedButton className="primary big" onConfirm={() => send({ type: 'publish_night', force: res.followUps.some((f) => !f.answered) })}>Publish and send to Day</TimedButton>
        </div>
        {res.deaths.length > 0 ? <p>Deaths tonight: <b className="dead-name">{res.deaths.map((d) => names[d]).join(', ')}</b></p> : <p>No deaths tonight.</p>}
        {res.revived.length > 0 && <p>Revived: {res.revived.map((d) => names[d]).join(', ')}</p>}
      </section>

      {res.followUps.filter((f) => !f.answered).map((f) => <FollowUpCard key={f.key} ctx={ctx} q={f} />)}

      {res.reviewItems.length > 0 && (
        <section className="card">
          <h2>Decisions{open > 0 && <span className="muted"> · {open} open</span>}</h2>
          {res.reviewItems.map((it) => (
            <div key={it.key} className={`review ${it.chosen === null ? 'open' : ''}`}>
              <div><b>{it.title}</b> <span className="muted small">{it.description}</span></div>
              <select value={it.chosen ?? it.default} onChange={(e) => send({ type: 'choose_review', key: it.key, optionId: e.target.value })}>
                {it.options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.id === it.default ? ' (recommended)' : ''}</option>)}
              </select>
              {it.chosen === null ? <button onClick={() => send({ type: 'choose_review', key: it.key, optionId: it.default })}>Accept</button> : <span className="ok small decided">✓ decided</span>}
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
        <span className="muted">as {storytellerLabel(r.title, r.roleId)}</span>
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
        <button onClick={() => { setText(r.finalLines.join('\n')); setEditing(!editing); }}><StableLabel labels={['Edit text', 'Cancel']} current={editing ? 1 : 0} /></button>
        {r.overridden && <button onClick={() => send({ type: 'override_result', key: r.key, lines: null })}>Reset</button>}
      </div>
      {editing && (
        <div className="editor">
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button className="primary" onClick={async () => { const res = await send({ type: 'override_result', key: r.key, lines: text.split('\n').filter(Boolean) }); if (res.ok) setEditing(false); }}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** An unanswered follow-up question: the player's phone is showing it; the Storyteller can answer for them. */
function FollowUpCard({ ctx, q }: { ctx: AdminCtx; q: FollowUp }) {
  const [value, setValue] = useState<Record<string, ActionChoice>>({});
  return (
    <section className="card warn">
      <h3>Waiting for {storytellerLabel(q.spec.title, q.roleId)} <Who ctx={ctx} id={q.playerId} /></h3>
      <p>Their phone is showing this question. Or answer for them:</p>
      <ActionPicker specs={[q.spec]} names={ctx.names} value={value} onChange={setValue} dead={new Set(ctx.seated.filter(ctx.isDead))} />
      <button disabled={!choiceComplete(q.spec, value[q.key])} onClick={() => send({ type: 'answer_follow_up_for', key: q.key, choice: value[q.key] })}>Answer for them</button>
    </section>
  );
}

function MathAdjust({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated } = ctx;
  const res = s.night!.resolution!;
  const hasMath = res.results.some((r) => r.roleId === 'mathematician');
  if (!hasMath) return null;
  const adj = s.night!.mathAdjust;
  const today = s.days[s.night!.number]?.abnormal ?? [];
  const auto = [...new Set([...today, ...res.abnormal].map((e) => e.playerId))];
  const toggleRemove = (id: string) => send({ type: 'math_adjust', add: adj.add, remove: adj.remove.includes(id) ? adj.remove.filter((x) => x !== id) : [...adj.remove, id] });
  const toggleAdd = (id: string) => send({ type: 'math_adjust', add: adj.add.includes(id) ? adj.add.filter((x) => x !== id) : [...adj.add, id], remove: adj.remove });
  return (
    <section className="card">
      <h2>Mathematician: abnormal abilities</h2>
      <ul>
        {today.map((e, i) => <li key={`day${i}`}><Who ctx={ctx} id={e.playerId} />: {e.detail} <span className="muted small">(today, {e.cause})</span></li>)}
        {res.abnormal.map((e, i) => <li key={i}><Who ctx={ctx} id={e.playerId} />: {e.detail} <span className="muted small">({e.cause})</span></li>)}
        {!auto.length && <li className="muted">None detected.</li>}
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
