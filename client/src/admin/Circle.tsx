// Admin circle view: the table as the players sit, with roles and statuses.
import { ROLE_BY_ID } from '@ct/shared';
import type { AdminCtx } from './AdminApp';

const short: Record<string, string> = { poisoned: 'poisoned', drunk: 'drunk', protected: 'protected', devils_advocate: "DA'd", butler_master: 'master', witched: 'cursed' };

export function CirclePanel({ ctx }: { ctx: AdminCtx }) {
  const { s, view, seated, names } = ctx;
  if (!seated.length) return <div className="card"><p className="muted">Nobody is seated yet.</p></div>;
  const n = seated.length;
  const alive = seated.filter((id) => !ctx.isDead(id)).length;
  return (
    <div className="circlewrap">
      <div className="circle">
        <div className="circle-center">
          <b>{s.phase.startsWith('NIGHT') ? `Night ${s.nightNumber}` : s.phase === 'DAY' ? `Day ${s.dayNumber}` : s.phase}</b>
          <div>{alive} / {n} alive</div>
          {s.setup.demonBluffs.length > 0 && <div className="muted small">Bluffs: {s.setup.demonBluffs.map((b) => ROLE_BY_ID[b].name).join(', ')}</div>}
        </div>
        {seated.map((id, i) => {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + 41 * Math.cos(angle);
          const y = 50 + 41 * Math.sin(angle);
          const a = s.assignments[id];
          const r = a?.roleId ? ROLE_BY_ID[a.roleId] : null;
          const dead = ctx.isDead(id);
          const imp = view.impairment[id];
          const tags = s.effects.filter((e) => e.targetPlayerId === id && short[e.type]).map((e) => short[e.type]);
          if (imp?.causes.some((c) => c.includes('no_dashii'))) tags.push('poisoned');
          return (
            <div key={id} className={`seat ${a?.alignment === 'evil' ? 'evil' : 'good'} ${dead ? 'dead' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}>
              <div className="seatnum">{i + 1}</div>
              <div className={dead ? 'dead-name seatname' : 'seatname'}>{names[id]}</div>
              <div className={`seatrole type-${r?.type ?? ''}`}>{r?.name ?? '—'}</div>
              {a?.believedRoleId && <div className="seatsub">thinks {ROLE_BY_ID[a.believedRoleId].name}</div>}
              <div className="seattags">
                {imp?.impaired && <span className="tag bad">{imp.causes.includes('own_character') && imp.causes.length === 1 ? 'impaired' : 'drunk/poisoned'}</span>}
                {[...new Set(tags)].filter((t) => t !== 'poisoned' && t !== 'drunk').map((t) => <span key={t} className="tag">{t}</span>)}
                {s.setup.lilMonstaTokenHolderId === id && <span className="tag evil">token</span>}
                {s.setup.redHerringId === id && <span className="tag">herring</span>}
                <span className={`dot ${view.presence[id] ? 'on' : ''}`} title={view.presence[id] ? 'online' : 'offline'} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small">Seat 1 is at the top; seats go clockwise. Border: blue good, red evil. Red name: dead.</p>
    </div>
  );
}
