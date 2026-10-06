import { useState } from 'react';
import { ROLES, ROLE_BY_ID } from '@ct/shared';
import { api, send } from '../api';
import { ImpairmentTags, TimedButton, TYPE_LABEL, TYPE_ORDER } from '../common';
import { VigoScarletWarning, Who, type AdminCtx } from './AdminApp';
import { AUTO_TRACKED, TRACKED } from './Day';
import { Briefing } from './Setup';

const CAUSE_LABEL: Record<string, string> = {
  own_character: 'own character', poisoner: 'Poisoner', sailor: 'Sailor', innkeeper: 'Innkeeper', goon: 'Goon',
  philosopher: 'Philosopher', pukka: 'Pukka', no_dashii: 'No Dashii', vigormortis: 'Vigormortis', admin: 'Storyteller',
};

export function Grimoire({ ctx, code }: { ctx: AdminCtx; code: string }) {
  const { s, view, names, seated, roleOf, label } = ctx;
  const [reassign, setReassign] = useState<string | null>(null);
  const derived = (pid: string) => (view.impairment[pid]?.causes ?? []).filter((c) => c.includes('no_dashii'));
  return (
    <div>
      <VigoScarletWarning ctx={ctx} />
      <div className="grim">
        {seated.map((id) => {
          const p = s.players.find((x) => x.id === id)!;
          const a = s.assignments[id];
          const r = a?.roleId ? ROLE_BY_ID[a.roleId] : null;
          const imp = view.impairment[id];
          const effects = s.effects.filter((e) => e.targetPlayerId === id);
          const flags = Object.entries(s.flags[id] ?? {}).filter(([, v]) => v).map(([k]) => k);
          const trackKey = r ? TRACKED[r.id] ?? AUTO_TRACKED[r.id] : undefined;
          return (
            <div key={id} className={`grimcard ${p.alive ? '' : 'dead'} ${a?.alignment === 'evil' ? 'evil' : 'good'}`}>
              <div className="row">
                <span className={`dot ${view.presence[id] ? 'on' : ''}`} />
                <b className="grow">{p.seat !== null ? `${p.seat + 1}. ` : ''}<Who ctx={ctx} id={id} /></b>
              </div>
              <div className={`grimrole type-${r?.type ?? ''}`}>{r?.name ?? 'No role'}</div>
              {a?.believedRoleId && <div className="small">believes: {ROLE_BY_ID[a.believedRoleId].name}</div>}
              {a?.grantedAbility && <div className="small">gained: {ROLE_BY_ID[a.grantedAbility.roleId].name} (from night {a.grantedAbility.fromNight})</div>}
              {s.setup.lilMonstaTokenHolderId === id && <div className="tag evil">Lil' Monsta token</div>}
              {s.setup.redHerringId === id && <div className="tag">red herring</div>}
              {a?.retainsAbilityWhenDead && <div className="tag">keeps ability when dead</div>}
              <div className="row small">
                <span>Alignment:</span>
                <button className={`chip ${a?.alignment}`} onClick={() => a && send({ type: 'set_alignment', playerId: id, alignment: a.alignment === 'good' ? 'evil' : 'good' })}>{a?.alignment ?? '—'}</button>
              </div>
              {imp?.impaired && <div className="small"><ImpairmentTags causes={imp.causes} /></div>}
              {effects.map((e) => (
                <div key={e.id} className="small effect">
                  {e.type === 'butler_master' ? `Butler's master (chosen by ${names[e.sourcePlayerId ?? ''] ?? '?'})`
                    : e.type === 'devils_advocate' ? `Devil's Advocate: survives execution today (${names[e.sourcePlayerId ?? ''] ?? '?'})`
                    : e.type === 'witched' ? `Witched: dies if they nominate today (${names[e.sourcePlayerId ?? ''] ?? '?'})`
                    : e.type === 'protected' ? `protected tonight (Innkeeper ${names[e.sourcePlayerId ?? ''] ?? ''})`
                    : `${e.type} (${CAUSE_LABEL[e.cause] ?? e.cause}${e.sourcePlayerId ? `, ${names[e.sourcePlayerId]}` : ''}, ${e.expiry.replace(/_/g, ' ')})`}
                  <button className="tiny" onClick={() => send({ type: 'remove_effect', effectId: e.id })}>✕</button>
                </div>
              ))}
              {derived(id).length > 0 && <div className="small effect">poisoned by the No Dashii (continuous)</div>}
              {trackKey && (
                <div className="row small">
                  <span>{r!.name}:</span>
                  <button className={`chip ${s.flags[id]?.[trackKey] ? 'used' : ''}`} onClick={() => send({ type: 'set_flag', playerId: id, key: trackKey, value: !s.flags[id]?.[trackKey] })}>{s.flags[id]?.[trackKey] ? 'Used' : 'Unused'}</button>
                </div>
              )}
              {flags.filter((f) => f !== trackKey).length > 0 && <div className="small muted">flags: {flags.filter((f) => f !== trackKey).join(', ')}</div>}
              {r?.reminder && <div className="small muted">{r.reminder}</div>}
              <div className="row wrap">
                <button className="tiny" onClick={() => setReassign(id)}>Change role</button>
                <button className="tiny" onClick={() => send({ type: 'add_effect', targetId: id, effectType: 'poisoned' })}>+ poison</button>
                <button className="tiny" onClick={() => send({ type: 'add_effect', targetId: id, effectType: 'drunk' })}>+ drunk</button>
                <button className="tiny" onClick={() => send({ type: 'mark_alive', playerId: id, alive: !p.alive })}>{p.alive ? 'Kill' : 'Revive'}</button>
                {!p.alive && (
                  <button className={`tiny chip ${p.ghostVoteUsed ? 'used' : ''}`} onClick={() => send({ type: 'set_ghost_vote', playerId: id, used: !p.ghostVoteUsed })}>
                    {p.ghostVoteUsed ? 'Vote used' : 'Vote available'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {reassign && <Reassign ctx={ctx} pid={reassign} onClose={() => setReassign(null)} />}

      <div className="cols">
        <section className="card">
          <h2>Game facts</h2>
          <p>Demon bluffs: {s.setup.demonBluffs.map((b) => ROLE_BY_ID[b].name).join(', ') || '—'}</p>
          {s.phase === 'DAY' && seated.some((id) => roleOf(id) === 'gossip') && <p>Gossip's statement today: {s.days[s.dayNumber]?.gossipStatement ?? 'none'}</p>}
          {s.setup.damselGuessResult && <p>Damsel guess: {s.setup.damselGuessResult.text}</p>}
          {s.setup.mezephelesWord && <p>Mezepheles word: "{s.setup.mezephelesWord}" {s.setup.mezephelesSpent ? '(spent)' : ''}</p>}
          {seated.some((id) => roleOf(id) === 'shabaloth') && <p>Shabaloth victims still dead: <span className="dead-name">{s.setup.shabalothKills.map((x) => names[x]).join(', ') || '—'}</span></p>}
          <label className="field"><span>Lil' Monsta token holder</span>
            <select value={s.setup.lilMonstaTokenHolderId ?? ''} onChange={(e) => send({ type: 'set_lil_monsta_holder', playerId: e.target.value || null })}>
              <option value="">nobody</option>
              {seated.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.label(id)}</option>)}
            </select>
          </label>
        </section>
        <Settings ctx={ctx} code={code} />
      </div>
      <Briefing ctx={ctx} />
    </div>
  );
}

function Reassign({ ctx, pid, onClose }: { ctx: AdminCtx; pid: string; onClose: () => void }) {
  const { s, names, seated, roleOf } = ctx;
  const [roleId, setRoleId] = useState(roleOf(pid) ?? '');
  const taken = new Set(seated.filter((x) => x !== pid).map(roleOf));
  const old = roleOf(pid);
  const effects = s.effects.filter((e) => e.sourcePlayerId === pid).length;
  const flags = Object.keys(s.flags[pid] ?? {}).length;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheetbody" onClick={(e) => e.stopPropagation()}>
        <h3>Change <Who ctx={ctx} id={pid} />'s role</h3>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          {TYPE_ORDER.map((t) => (
            <optgroup key={t} label={TYPE_LABEL[t]}>
              {ROLES.filter((r) => r.type === t && s.enabledRoles[r.id]).map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id)}>{r.name}</option>)}
            </optgroup>
          ))}
        </select>
        <div className="card">
          <b>Summary</b>
          <ul>
            <li>{old ? ROLE_BY_ID[old].name : 'none'} → {roleId ? ROLE_BY_ID[roleId].name : 'none'}</li>
            <li>Clears {effects} effect(s) this player created and {flags} flag(s); resets alignment to the new role's natural alignment.</li>
            <li>{s.settings.notifyOnRoleChange ? 'The player is told "Your role has changed".' : 'The player is not notified (setting off).'}</li>
            <li>Logged in the event log.</li>
          </ul>
        </div>
        <div className="row">
          <button onClick={onClose}>Cancel</button>
          <TimedButton className="primary" disabled={!roleId || roleId === old} onConfirm={async () => { const r = await send({ type: 'assign_role', playerId: pid, roleId }); if (r.ok) onClose(); }}>Confirm</TimedButton>
        </div>
      </div>
    </div>
  );
}

function Settings({ ctx, code }: { ctx: AdminCtx; code: string }) {
  const { s } = ctx;
  const bool = (key: string, label: string) => (
    <label className="check"><input type="checkbox" checked={!!(s.settings as any)[key]} onChange={(e) => send({ type: 'set_setting', key, value: e.target.checked })} /> {label}</label>
  );
  const num = (key: string, label: string) => (
    <label className="field"><span>{label}</span>
      <input type="number" defaultValue={(s.settings as any)[key]} key={(s.settings as any)[key]} onBlur={(e) => Number(e.target.value) !== (s.settings as any)[key] && send({ type: 'set_setting', key, value: Number(e.target.value) })} />
    </label>
  );
  return (
    <section className="card">
      <h2>Settings</h2>
      {bool('notifyOnRoleChange', 'Tell players when you change their role')}
      {num('countdownSeconds', 'Night countdown (seconds)')}
      {num('ravenkeeperExtensionSeconds', 'Ravenkeeper extension (seconds)')}
      <div className="row wrap">
        {s.phase !== 'ENDED' && <TimedButton className="danger" onConfirm={() => send({ type: 'end_game' })}>End game</TimedButton>}
        <TimedButton className="danger" onConfirm={async () => {
          await api(code, '/reset', {}, localStorage.getItem(`ct_token_${code}`));
          location.reload();
        }}>New game (erase)</TimedButton>
      </div>
      <details>
        <summary>Force phase (if stuck)</summary>
        <div className="row wrap">
          {(['LOBBY', 'SETUP', 'DAY', 'ENDED'] as const).map((p) => (
            <TimedButton key={p} className="danger" onConfirm={() => send({ type: 'force_phase', phase: p })}>{p}</TimedButton>
          ))}
        </div>
      </details>
    </section>
  );
}
