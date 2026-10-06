import { useState } from 'react';
import { ROLES, ROLE_BY_ID, type RoleType } from '@ct/shared';
import { send } from '../api';
import { TimedButton, TYPE_LABEL, TYPE_ORDER } from '../common';
import { VigoScarletWarning, Who, type AdminCtx } from './AdminApp';

export function SetupPanel({ ctx }: { ctx: AdminCtx }) {
  const { s, view } = ctx;
  const live = s.phase !== 'LOBBY' && s.phase !== 'SETUP';
  return (
    <div>
      {live && <div className="card warn">The game is running. Changes here apply immediately (players see role list changes live).</div>}
      <div className="cols">
        <div>
          <Checklist ctx={ctx} />
          <SeatingEditor ctx={ctx} />
          <Assignment ctx={ctx} />
        </div>
        <div>
          <SetupItems ctx={ctx} />
          <TypeCounts ctx={ctx} />
          <RoleChecklist ctx={ctx} />
        </div>
      </div>
      {view.state.phase === 'SETUP' && <Briefing ctx={ctx} />}
    </div>
  );
}

function Checklist({ ctx }: { ctx: AdminCtx }) {
  const { view, s } = ctx;
  const ready = view.setupChecklist.every((c) => !c.blocking || c.done);
  return (
    <section className="card">
      <h2>Before Night 0</h2>
      <ul className="checklist">
        {view.setupChecklist.map((c) => <li key={c.id} className={c.done ? 'done' : c.blocking ? 'todo' : 'warnitem'}>{c.done ? '✓' : c.blocking ? '○' : '!'} {c.label}</li>)}
      </ul>
      {view.warnings.map((w, i) => <div key={i} className="warnline">⚠ {w}</div>)}
      {s.phase === 'SETUP' && (
        <div className="row">
          <TimedButton className="primary big" disabled={!ready} onConfirm={() => send({ type: 'begin_night0' })}>Begin Night 0</TimedButton>
          {!ready && <TimedButton className="danger" onConfirm={() => send({ type: 'begin_night0', force: true })}>Force</TimedButton>}
        </div>
      )}
      {s.phase === 'LOBBY' && <button className="primary" onClick={() => send({ type: 'go_setup' })}>Go to setup</button>}
    </section>
  );
}

function SeatingEditor({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated } = ctx;
  const [drag, setDrag] = useState<number | null>(null);
  const unseated = s.players.filter((p) => !p.isAdmin && p.seat === null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= seated.length) return;
    const order = seated.slice();
    const [x] = order.splice(from, 1);
    order.splice(to, 0, x);
    send({ type: 'set_seating', order });
  };
  const published = s.seatingPublished && s.publishedSeating.join() === seated.join();
  return (
    <section className="card">
      <h2>Seating</h2>
      <ol className="seatlist">
        {seated.map((id, i) => (
          <li key={id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); }}>
            <span className="grip">⠿</span>
            <span className="grow"><Who ctx={ctx} id={id} /></span>
            <button onClick={() => move(i, i - 1)}>↑</button>
            <button onClick={() => move(i, i + 1)}>↓</button>
            <button onClick={() => send({ type: 'set_seating', order: seated.filter((x) => x !== id) })}>Unseat</button>
          </li>
        ))}
      </ol>
      {unseated.length > 0 && (
        <p>Not seated: {unseated.map((p) => <button key={p.id} onClick={() => send({ type: 'set_seating', order: [...seated, p.id] })}>+ {p.name}</button>)}</p>
      )}
      <div className="row">
        <button onClick={() => send({ type: 'randomise_seating' })}>Randomise</button>
        <button className={published ? '' : 'primary'} onClick={() => send({ type: 'publish_seating' })}>{s.seatingPublished ? (published ? 'Published ✓' : 'Republish seating') : 'Publish seating'}</button>
      </div>
    </section>
  );
}

function Assignment({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated, roleOf } = ctx;
  const [proposal, setProposal] = useState<Record<string, string> | null>(null);
  const enabled = ROLES.filter((r) => s.enabledRoles[r.id]);
  const taken = new Set(seated.map(roleOf).filter(Boolean));
  const pref = (pid: string) => {
    const p = s.players.find((x) => x.id === pid)?.rolePreference;
    return p && p !== 'none' ? `— wants ${TYPE_LABEL[p].replace(/s$/, '')} —` : '— none —';
  };
  const assign = (pid: string, roleId: string | null) => send({ type: 'assign_role', playerId: pid, roleId });
  return (
    <section className="card">
      <h2>Roles</h2>
      <VigoScarletWarning ctx={ctx} />
      <table className="tbl">
        <tbody>
          {seated.map((pid) => {
            const r = roleOf(pid);
            return (
              <tr key={pid}>
                <td><Who ctx={ctx} id={pid} /></td>
                <td>
                  <select value={r ?? ''} onChange={(e) => assign(pid, e.target.value || null)}>
                    <option value="">{pref(pid)}</option>
                    {TYPE_ORDER.map((t) => (
                      <optgroup key={t} label={TYPE_LABEL[t]}>
                        {enabled.filter((x) => x.type === t).map((x) => <option key={x.id} value={x.id} disabled={taken.has(x.id) && x.id !== r}>{x.name}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td className={`small type-${r ? ROLE_BY_ID[r].type : ''}`}>{r ? ROLE_BY_ID[r].type : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <button onClick={async () => { const res = await send({ type: 'suggest_distribution' }); if (res.ok) setProposal(res.data); }}>Suggest distribution</button>
      </div>
      {proposal && (
        <div className="proposal">
          <h3>Suggestion</h3>
          <ul>{Object.entries(proposal).map(([pid, r]) => <li key={pid}><Who ctx={ctx} id={pid} />: <b className={`type-${ROLE_BY_ID[r].type}`}>{ROLE_BY_ID[r].name}</b></li>)}</ul>
          <div className="row">
            <button className="primary" onClick={async () => { const res = await send({ type: 'assign_many', assignments: proposal }); if (res.ok) setProposal(null); }}>Apply</button>
            <button onClick={async () => { const res = await send({ type: 'suggest_distribution' }); if (res.ok) setProposal(res.data); }}>Reroll</button>
            <button onClick={() => setProposal(null)}>Discard</button>
          </div>
        </div>
      )}
    </section>
  );
}

function TypeCounts({ ctx }: { ctx: AdminCtx }) {
  const { view, seated } = ctx;
  const tc = view.typeCounts;
  const [edit, setEdit] = useState<number[] | null>(null);
  const vals = edit ?? tc.target;
  const sum = vals.reduce((a, b) => a + b, 0);
  return (
    <section className="card">
      <h2>Type counts</h2>
      <table className="tbl counts">
        <thead><tr><th></th>{TYPE_ORDER.map((t) => <th key={t}>{TYPE_LABEL[t]}</th>)}</tr></thead>
        <tbody>
          <tr>
            <td>Target {tc.source === 'override' ? '(yours)' : '(chart)'}</td>
            {vals.map((v, i) => (
              <td key={i}><input type="number" min={0} value={v} onChange={(e) => { const n = vals.slice(); n[i] = Number(e.target.value); setEdit(n); }} /></td>
            ))}
          </tr>
          <tr><td>Assigned</td>{tc.actual.map((v, i) => <td key={i} className={v !== tc.target[i] ? 'bad' : ''}>{v}</td>)}</tr>
        </tbody>
      </table>
      <div className="row">
        {edit && <button className="primary" disabled={sum !== seated.length} onClick={async () => { const r = await send({ type: 'set_type_counts', counts: edit as [number, number, number, number] }); if (r.ok) setEdit(null); }}>Save counts ({sum}/{seated.length})</button>}
        {edit && <button onClick={() => setEdit(null)}>Cancel</button>}
        {tc.source === 'override' && <button onClick={() => send({ type: 'set_type_counts', counts: null })}>Reset to default chart</button>}
      </div>
      <p className="muted small">Default chart adjusts for Balloonist (+1 Outsider), Vigormortis (−1 Outsider) and Lil' Monsta (+1 Minion). Counts are advisory.</p>
    </section>
  );
}

function SetupItems({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated, roleOf, view } = ctx;
  const inPlay = new Set(seated.map(roleOf).filter(Boolean) as string[]);
  const enabledOf = (pred: (t: RoleType, align: string) => boolean) => ROLES.filter((r) => s.enabledRoles[r.id] && pred(r.type, r.alignment) && !inPlay.has(r.id));
  const believedTaken = new Set(seated.map((id) => s.assignments[id]?.believedRoleId).filter(Boolean) as string[]);
  const drunks = seated.filter((id) => roleOf(id) === 'drunk');
  const marionettes = seated.filter((id) => roleOf(id) === 'marionette');
  const bluffCands = ROLES.filter((r) => s.enabledRoles[r.id] && r.alignment === 'good' && !inPlay.has(r.id) && (!believedTaken.has(r.id) || s.setup.demonBluffs.includes(r.id)));
  const goodPlayers = seated.filter((id) => s.assignments[id]?.alignment === 'good');
  const bluffs = [0, 1, 2].map((i) => s.setup.demonBluffs[i] ?? '');
  const setBluff = (i: number, v: string) => { const b = bluffs.slice(); b[i] = v; send({ type: 'set_bluffs', roleIds: b.filter(Boolean) }); };
  return (
    <section className="card">
      <h2>Setup decisions</h2>
      {drunks.map((pid) => (
        <label key={pid} className="field">
          <span>Drunk (<Who ctx={ctx} id={pid} />) believes they are</span>
          <select value={s.assignments[pid]?.believedRoleId ?? ''} onChange={(e) => send({ type: 'set_believed_role', playerId: pid, roleId: e.target.value || null })}>
            <option value="">Choose a Townsfolk not in play…</option>
            {enabledOf((t) => t === 'townsfolk').map((r) => <option key={r.id} value={r.id} disabled={believedTaken.has(r.id) && s.assignments[pid]?.believedRoleId !== r.id}>{r.name}</option>)}
          </select>
        </label>
      ))}
      {marionettes.map((pid) => (
        <label key={pid} className="field">
          <span>Marionette (<Who ctx={ctx} id={pid} />) believes they are</span>
          <select value={s.assignments[pid]?.believedRoleId ?? ''} onChange={(e) => send({ type: 'set_believed_role', playerId: pid, roleId: e.target.value || null })}>
            <option value="">Choose a good role not in play…</option>
            {enabledOf((_t, a) => a === 'good').map((r) => <option key={r.id} value={r.id} disabled={believedTaken.has(r.id) && s.assignments[pid]?.believedRoleId !== r.id}>{r.name} ({r.type})</option>)}
          </select>
        </label>
      ))}
      {inPlay.has('fortune_teller') && (
        <label className="field">
          <span>Fortune Teller's red herring</span>
          <div className="row">
            <select value={s.setup.redHerringId ?? ''} onChange={(e) => send({ type: 'set_red_herring', playerId: e.target.value || null })}>
              <option value="">Choose a good player…</option>
              {goodPlayers.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.label(id)}</option>)}
            </select>
            <button onClick={() => send({ type: 'suggest_red_herring' })}>Recommend</button>
          </div>
        </label>
      )}
      <div className="field">
        <span>Demon bluffs (3 good roles not in play)</span>
        <div className="row wrap">
          {bluffs.map((b, i) => (
            <select key={i} value={b} onChange={(e) => setBluff(i, e.target.value)}>
              <option value="">—</option>
              {bluffCands.map((r) => <option key={r.id} value={r.id} disabled={bluffs.includes(r.id) && b !== r.id}>{r.name}</option>)}
            </select>
          ))}
          <button onClick={() => send({ type: 'suggest_bluffs' })}>Suggest random</button>
        </div>
      </div>
      {inPlay.has('mezepheles') && (
        <label className="field">
          <span>Mezepheles secret word</span>
          <div className="row">
            <input defaultValue={s.setup.mezephelesWord ?? ''} key={s.setup.mezephelesWord ?? ''} onBlur={(e) => e.target.value && e.target.value !== s.setup.mezephelesWord && send({ type: 'set_mezepheles_word', word: e.target.value })} />
            <button onClick={() => send({ type: 'random_mezepheles_word' })}>Random</button>
          </div>
        </label>
      )}
      {inPlay.has('godfather') && (
        <div className="field">
          <span>Godfather: Outsiders −1 or +1</span>
          <div className="seg">
            <button className={s.setup.godfatherOutsiders === -1 ? 'on' : ''} disabled={view.typeCounts.chartOutsiders === 0} onClick={() => send({ type: 'set_godfather_outsiders', value: -1 })}>−1 Outsider</button>
            <button className={s.setup.godfatherOutsiders === 1 ? 'on' : ''} onClick={() => send({ type: 'set_godfather_outsiders', value: 1 })}>+1 Outsider</button>
          </div>
          {view.typeCounts.chartOutsiders === 0 && <span className="muted small">The chart has no Outsiders for this player count, so only +1 is possible.</span>}
        </div>
      )}
      {inPlay.has('lil_monsta') && (
        <label className="field">
          <span>Lil' Monsta player becomes (Minion)</span>
          <select value={s.setup.lilMonstaMinionRole ?? ''} onChange={(e) => send({ type: 'set_lil_monsta_minion', roleId: e.target.value || null })}>
            <option value="">Choose a Minion not in play…</option>
            {enabledOf((t) => t === 'minion').map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
    </section>
  );
}

function RoleChecklist({ ctx }: { ctx: AdminCtx }) {
  const { s } = ctx;
  const toggle = (id: string, en: boolean) => send({ type: 'set_role_enabled', roleId: id, enabled: en });
  return (
    <section className="card">
      <h2>Role checklist</h2>
      <div className="row">
        <button onClick={() => send({ type: 'set_all_roles_enabled', enabled: true })}>All</button>
        <button onClick={() => send({ type: 'set_all_roles_enabled', enabled: false })}>None</button>
      </div>
      {TYPE_ORDER.map((t) => (
        <div key={t}>
          <h3 className={`type-${t}`}>{TYPE_LABEL[t]}</h3>
          <div className="checkgrid">
            {ROLES.filter((r) => r.type === t).map((r) => (
              <label key={r.id} className="check" title={r.abilityText}>
                <input type="checkbox" checked={!!s.enabledRoles[r.id]} onChange={(e) => toggle(r.id, e.target.checked)} /> {r.name}
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function Briefing({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated, roleOf, label } = ctx;
  const facts: string[] = [];
  for (const id of seated) {
    const r = roleOf(id);
    const b = s.assignments[id]?.believedRoleId;
    if (r === 'drunk') facts.push(`${names[id]} is the Drunk and believes they are the ${b ? ROLE_BY_ID[b].name : '(not chosen)'}.`);
    if (r === 'marionette') facts.push(`${names[id]} is the Marionette and believes they are the ${b ? ROLE_BY_ID[b].name : '(not chosen)'}. The Demon is told who they are.`);
    if (r === 'lil_monsta') facts.push(`${names[id]} is Lil' Monsta: gets the Demon's info on Night 0, then becomes the ${s.setup.lilMonstaMinionRole ? ROLE_BY_ID[s.setup.lilMonstaMinionRole].name : '(not chosen)'} and holds the token.`);
  }
  if (s.setup.redHerringId) facts.push(`Red herring: ${label(s.setup.redHerringId)}.`);
  for (const id of seated) {
    if (roleOf(id) === 'damsel') facts.push(`${names[id]} is the Damsel. Every Minion except a Marionette is told "A Damsel is in play."`);
    const conv = s.assignments[id]?.history.find((h) => h.from === 'damsel' && h.reason.includes('Huntsman'));
    if (conv && conv.to) facts.push(`${names[id]} was the Damsel and is now the ${ROLE_BY_ID[conv.to].name} (Huntsman).`);
  }
  if (seated.some((id) => roleOf(id) === 'godfather')) {
    const outs = seated.filter((id) => ROLE_BY_ID[roleOf(id) ?? '']?.type === 'outsider').map((id) => ROLE_BY_ID[roleOf(id)!].name);
    facts.push(`The Godfather will learn the Outsiders in play: ${outs.join(', ') || 'none'}.`);
  }
  facts.push(`Demon bluffs: ${s.setup.demonBluffs.map((b) => ROLE_BY_ID[b].name).join(', ') || '(none)'}.`);
  if (s.setup.mezephelesWord && seated.some((id) => roleOf(id) === 'mezepheles')) facts.push(`Mezepheles word: "${s.setup.mezephelesWord}".`);
  const demons = seated.filter((id) => ROLE_BY_ID[roleOf(id) ?? '']?.type === 'demon');
  const minions = seated.filter((id) => ROLE_BY_ID[roleOf(id) ?? '']?.type === 'minion');
  facts.push(`Evil team: Demon ${demons.map(label).join(', ') || '(none)'}; Minions ${minions.map(label).join(', ') || '(none)'}.`);
  facts.push('On Night 0 the Minions learn each other (not the Marionette, not the Demon). Remind the Demon at the table to reveal themselves to the Minions.');
  return (
    <section className="card briefing">
      <h2>Storyteller briefing</h2>
      <ul>{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
    </section>
  );
}
