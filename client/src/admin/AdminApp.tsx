import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ROLE_BY_ID, type AdminView, type GameState } from '@ct/shared';
import { send } from '../api';
import { NightOrder, RoleList, TimedButton } from '../common';
import { SetupPanel } from './Setup';
import { NightPanel, ReviewPanel } from './Night';
import { DayPanel } from './Day';
import { Grimoire } from './Grimoire';
import { LogPanel } from './Log';
import { CirclePanel } from './Circle';
import { StoryPanel } from './Story';

export type Tab = 'lobby' | 'setup' | 'night' | 'review' | 'day' | 'grimoire' | 'circle' | 'story' | 'log' | 'ref';

export interface AdminCtx {
  view: AdminView;
  s: GameState;
  names: Record<string, string>;
  seated: string[];
  roleOf: (pid: string) => string | null;
  label: (pid: string | null | undefined) => string;
  isDead: (pid: string | null | undefined) => boolean;
  optStyle: (pid: string) => React.CSSProperties | undefined;
}

/** Known-buggy combination (owner rule): a standing text warning wherever roles are shown. */
export function VigoScarletWarning({ ctx }: { ctx: AdminCtx }) {
  const vigo = ctx.seated.find((id) => ctx.roleOf(id) === 'vigormortis');
  const sw = ctx.seated.find((id) => ctx.roleOf(id) === 'scarlet_woman');
  if (!vigo || !sw) return null;
  return (
    <div className="combo-warning" role="note">
      <b>⚠ Vigormortis and Scarlet Woman are both in play</b>
      <span>
        {ctx.names[vigo]} (Vigormortis) and {ctx.names[sw]} (Scarlet Woman) should not be in the same game. There are known bugs
        around this combination. Consider changing one of them.
      </span>
    </div>
  );
}

/** A player's name, red when they are dead (owner request: dead names are red everywhere). */
export function Who({ ctx, id, role }: { ctx: AdminCtx; id: string | null | undefined; role?: boolean }) {
  if (!id) return <>—</>;
  return <span className={ctx.isDead(id) ? 'dead-name' : undefined}>{role ? ctx.label(id) : ctx.names[id] ?? id}</span>;
}

export function useAdminCtx(view: AdminView): AdminCtx {
  return useMemo(() => {
    const s = view.state;
    const names = Object.fromEntries(s.players.map((p) => [p.id, p.name]));
    const seated = s.players.filter((p) => !p.isAdmin && p.seat !== null).sort((a, b) => a.seat! - b.seat!).map((p) => p.id);
    const roleOf = (pid: string) => s.assignments[pid]?.roleId ?? null;
    const label = (pid: string | null | undefined) => {
      if (!pid) return '—';
      const r = roleOf(pid);
      return `${names[pid] ?? pid}${r ? ` (${ROLE_BY_ID[r]?.name ?? r})` : ''}`;
    };
    const deadSet = new Set(s.players.filter((p) => !p.alive).map((p) => p.id));
    const isDead = (pid: string | null | undefined) => !!pid && deadSet.has(pid);
    const optStyle = (pid: string) => (deadSet.has(pid) ? { color: '#ff6b6b' } : undefined);
    return { view, s, names, seated, roleOf, label, isDead, optStyle };
  }, [view]);
}

export function phaseName(s: GameState): string {
  return s.phase.startsWith('NIGHT') ? `Night ${s.nightNumber} — ${PHASE_LABEL[s.phase]}` : s.phase === 'DAY' ? `Day ${s.dayNumber}` : PHASE_LABEL[s.phase];
}

/** What the Night, Review and Day tabs show when their phase isn't active. */
export function InactiveNote({ s, what }: { s: GameState; what: string }) {
  return <div className="card"><p>{what} Current phase: {phaseName(s)}.</p></div>;
}

function defaultTab(phase: GameState['phase']): Tab {
  switch (phase) {
    case 'LOBBY': return 'lobby';
    case 'SETUP': return 'setup';
    case 'NIGHT_COLLECTING': return 'night';
    case 'NIGHT_RESOLVING': return 'review';
    case 'DAY': return 'day';
    default: return 'grimoire';
  }
}

const PHASE_LABEL: Record<GameState['phase'], string> = {
  LOBBY: 'Lobby', SETUP: 'Setup', NIGHT_COLLECTING: 'Night: collecting', NIGHT_RESOLVING: 'Night: review', DAY: 'Day', ENDED: 'Game over',
};

export function AdminApp({ view, code }: { view: AdminView; code: string }) {
  const ctx = useAdminCtx(view);
  const s = view.state;
  const [tab, setTab] = useState<Tab>(defaultTab(s.phase));
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { setTab(defaultTab(s.phase)); }, [s.phase]);
  const phaseText = phaseName(s);

  const tabs: [Tab, string][] = [
    ['lobby', 'Lobby'], ['setup', 'Setup'], ['night', 'Night'], ['review', 'Review'], ['day', 'Day'], ['grimoire', 'Grimoire'], ['circle', 'Circle'], ['ref', 'Reference'], ['story', 'Story'], ['log', 'Log'],
  ];
  // Once the game has started, Lobby, Setup, Story and Log live in the "More" menu.
  const started = s.phase !== 'LOBBY' && s.phase !== 'SETUP';
  const tucked: Tab[] = ['lobby', 'setup', 'story', 'log'];
  const visible = tabs.filter(([t]) => !started || !tucked.includes(t));
  const menuItems = tabs.filter(([t]) => started && tucked.includes(t));
  const activeTucked = menuItems.find(([t]) => t === tab);
  const pick = (t: Tab) => { setTab(t); setMoreOpen(false); };
  // The tab that matches the current phase gets a highlight when you are elsewhere, so it's easy to get back.
  const phaseTab: Tab | null = s.phase === 'ENDED' ? null : defaultTab(s.phase);

  return (
    <div className="admin">
      <header className="adminhead">
        <div>
          <b>Storyteller</b> <span className="phase">{phaseText}</span>
        </div>
        <div className="muted small">{ctx.seated.length} seated · {Object.values(view.presence).filter(Boolean).length} online</div>
      </header>
      <div className="tabbar">
        <nav className="admintabs">
          {visible.map(([t, l]) => (
            <button key={t} className={tab === t ? 'on' : t === phaseTab ? 'phase-hint' : ''} title={t === phaseTab && tab !== t ? 'The game is here' : undefined} onClick={() => pick(t)}>{l}</button>
          ))}
        </nav>
        {started && (
          <button className={`moretab${activeTucked ? ' on' : ''}${!activeTucked && phaseTab && tucked.includes(phaseTab) && started ? ' phase-hint' : ''}`} onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen}>
            {activeTucked ? activeTucked[1] : 'More'} ▾
          </button>
        )}
        {started && moreOpen && (
          <>
            <div className="menu-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="moremenu" role="menu">
              {menuItems.map(([t, l]) => <button key={t} role="menuitem" className={tab === t ? 'on' : ''} onClick={() => pick(t)}>{l}</button>)}
            </div>
          </>
        )}
      </div>
      <main className="adminmain">
        {tab === 'lobby' && <LobbyPanel ctx={ctx} code={code} />}
        {tab === 'setup' && <SetupPanel ctx={ctx} />}
        {tab === 'night' && <NightPanel ctx={ctx} />}
        {tab === 'review' && <ReviewPanel ctx={ctx} />}
        {tab === 'day' && <DayPanel ctx={ctx} />}
        {tab === 'grimoire' && <Grimoire ctx={ctx} code={code} />}
        {tab === 'circle' && <CirclePanel ctx={ctx} />}
        {tab === 'story' && <StoryPanel ctx={ctx} />}
        {tab === 'log' && <LogPanel ctx={ctx} code={code} />}
        {tab === 'ref' && (
          <div className="cols">
            <div><h2>Enabled roles</h2><RoleList enabled={Object.keys(s.enabledRoles).filter((r) => s.enabledRoles[r])} /></div>
            <div><h2>Night order</h2><NightOrder enabled={Object.keys(s.enabledRoles).filter((r) => s.enabledRoles[r])} /></div>
          </div>
        )}
      </main>
    </div>
  );
}

function JoinQr({ code }: { code: string }) {
  const [url, setUrl] = useState('');
  const [img, setImg] = useState('');
  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then((c) => {
      const base = (c.publicUrl || location.origin).replace(/\/$/, '');
      const u = `${base}/g/${encodeURIComponent(code)}`;
      setUrl(u);
      QRCode.toDataURL(u, { margin: 1, width: 220 }).then(setImg);
    });
  }, [code]);
  return (
    <div className="qr">
      {img && <img src={img} alt="Join QR code" />}
      <div className="mono">{url}</div>
    </div>
  );
}

function LobbyPanel({ ctx, code }: { ctx: AdminCtx; code: string }) {
  const { s, view } = ctx;
  const players = s.players.filter((p) => !p.isAdmin);
  const lobbyish = s.phase === 'LOBBY' || s.phase === 'SETUP';
  return (
    <div className="cols">
      <div>
        <h2>Players ({players.length})</h2>
        <table className="tbl">
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td><span className={`dot ${view.presence[p.id] ? 'on' : ''}`} /></td>
                <td><Who ctx={ctx} id={p.id} /></td>
                <td className="right">
                  {lobbyish && (
                    <>
                      <button onClick={() => { const n = prompt('New name', p.name); if (n) send({ type: 'rename_player', playerId: p.id, name: n }); }}>Rename</button>
                      <TimedButton className="danger" onConfirm={() => send({ type: 'remove_player', playerId: p.id })}>Remove</TimedButton>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {s.phase === 'LOBBY' && <button className="primary big" onClick={() => send({ type: 'go_setup' })}>Continue to setup →</button>}
      </div>
      <div>
        <h2>Join</h2>
        <p className="muted">Players open this on the same wifi:</p>
        <JoinQr code={code} />
      </div>
    </div>
  );
}
