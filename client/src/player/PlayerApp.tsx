import { useEffect, useMemo, useState } from 'react';
import type { ActionChoice, PlayerView } from '@ct/shared';
import { send } from '../api';
import { ActionPicker, Countdown, Messages, NightOrder, RoleCardView, RoleList, Seating, choiceComplete } from '../common';
import { NightGames } from './Games';

type Tab = 'home' | 'role' | 'roles' | 'order' | 'seats';

export function PlayerApp({ view }: { view: PlayerView }) {
  const [tab, setTab] = useState<Tab>('home');
  // Server clock offset, measured when this view arrived (not on every render).
  const offset = useMemo(() => view.serverNow - Date.now(), [view.serverNow]);
  const names = useMemo(() => Object.fromEntries(view.players.map((p) => [p.id, p.name])), [view.players]);
  const seatingNames = view.seating.map((id) => names[id] ?? '?');
  // Players only know who is dead when the Storyteller announces deaths (and always know about themselves).
  // Who shows as dead (red) on players' phones: a snapshot taken at each dawn, so day deaths appear next morning.
  const dead = useMemo(() => new Set(view.deadAtDawn), [view.deadAtDawn]);
  const seatingDead = view.seating.map((id) => dead.has(id));
  const isNight = view.phase === 'NIGHT_COLLECTING' || view.phase === 'NIGHT_RESOLVING';

  let home;
  if (view.phase === 'LOBBY' || view.phase === 'SETUP') home = <Lobby view={view} />;
  else if (view.phase === 'NIGHT_COLLECTING' && !view.collectingOpen) home = <RoleReveal view={view} />;
  else if (isNight) home = <NightScreen view={view} names={names} offset={offset} dead={dead} />;
  else if (view.phase === 'DAY') home = <DayScreen view={view} names={names} />;
  else home = <GameOver view={view} />;

  return (
    <div className={`player ${isNight ? 'night' : 'daylight'}`}>
      <main className={tab === 'home' && isNight && view.collectingOpen ? 'full' : ''}>
        {tab === 'home' && home}
        {tab === 'role' && (
          <div className="pad">
            <h2>My role</h2>
            <RoleCardView role={view.me.role} />
            <Messages messages={view.me.messages.filter((m) => m.kind === 'starting')} />
            {!view.me.alive && <div className="card dead">You are dead.</div>}
          </div>
        )}
        {tab === 'roles' && <div className="pad"><h2>Roles in this game's script</h2><RoleList enabled={view.enabledRoles} /></div>}
        {tab === 'order' && <div className="pad"><h2>Night order</h2><NightOrder enabled={view.enabledRoles} /></div>}
        {tab === 'seats' && <div className="pad"><h2>Seating</h2><Seating names={seatingNames} published={view.seatingPublished} dead={seatingDead} /></div>}
      </main>
      <nav className="tabs">
        {([['home', isNight ? 'Night' : view.phase === 'DAY' ? 'Day' : 'Game'], ['role', 'My role'], ['roles', 'Roles'], ['order', 'Order'], ['seats', 'Seats']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

function Lobby({ view }: { view: PlayerView }) {
  const players = view.players.filter((p) => !p.isAdmin);
  return (
    <div className="pad">
      <h2>Welcome, {view.me.name}</h2>
      <div className="card">
        <p>{view.phase === 'SETUP' ? 'The Storyteller is setting up the game.' : 'Waiting for the Storyteller to start.'}</p>
        {!view.hasAdmin && (
          <p>
            Nobody is the Storyteller yet.{' '}
            <button onClick={() => send({ type: 'claim_admin' })}>Become Storyteller</button>
          </p>
        )}
      </div>
      <h3>Players ({players.length})</h3>
      <ul className="names">{players.map((p) => <li key={p.id}>{p.name}{p.id === view.me.id ? ' (you)' : ''}</li>)}</ul>
      <p className="muted small">Check the Roles tab to read every character in this game.</p>
    </div>
  );
}

function RoleReveal({ view }: { view: PlayerView }) {
  return (
    <div className="pad">
      <h2>Night 0 begins</h2>
      <p className="muted">Make sure nobody can see your screen.</p>
      <RoleCardView role={view.me.role} />
      <Messages messages={view.me.messages.filter((m) => m.kind === 'starting')} />
      {view.me.hasSeenRole ? (
        <div className="card">Thanks. Wait for the Storyteller to start the night.</div>
      ) : (
        <button className="primary big" onClick={() => send({ type: 'seen_role' })}>I have seen my role</button>
      )}
    </div>
  );
}

function NightScreen({ view, names, offset, dead }: { view: PlayerView; names: Record<string, string>; offset: number; dead: Set<string> }) {
  const real = view.me.actions;
  const specs = real;
  const [choice, setChoice] = useState<Record<string, ActionChoice>>(() => (view.me.submission?.actions ?? {}));
  const [sheet, setSheet] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const collecting = view.phase === 'NIGHT_COLLECTING';

  useEffect(() => { setChoice(view.me.submission?.actions ?? {}); setEditing(false); }, [view.nightNumber]);

  const complete = specs.every((s) => choiceComplete(s, choice[s.key]));
  const submit = async () => {
    if (!complete) { setSheet(true); return; }
    const r = await send({ type: 'submit_night', actions: real.length ? choice : {} });
    if (r.ok) { setSheet(false); setEditing(false); }
  };
  const submitted = view.me.submitted && !editing;

  return (
    <div className="nightscreen">
      <header className="nighthead">
        <span className="nightlabel">Night {view.nightNumber}</span>
        <Countdown endsAt={view.nightEndsAt} offset={offset} />
        <button onClick={() => setRoleOpen(true)}>My role</button>
      </header>
      {/* Owner rule: games unlock only after the player has finished their night action (or the night has closed). */}
      {view.me.submitted || !collecting ? <NightGames code={view.gameCode} /> : (
        <div className="gamelock">
          <div className="gamelock-icon">☾</div>
          <p>{real.length ? 'Make your night choice and submit it.' : 'Press Continue below.'}</p>
          <p className="muted small">The games unlock once you're done.</p>
        </div>
      )}
      {view.me.ravenkeeperPrompt && <RavenkeeperPrompt view={view} names={names} dead={dead} />}
      <footer className="nightbar">
        {submitted || !collecting ? (
          <div className="waiting">
            {view.me.submitted ? 'Submitted. Waiting for everyone.' : 'The night is ending.'}
            {collecting && real.length > 0 && <button onClick={() => { setEditing(true); setSheet(true); }}>Change</button>}
          </div>
        ) : !real.length ? (
          <>
            <div className="waiting">No night action tonight.</div>
            <button className="primary" onClick={submit}>Continue</button>
          </>
        ) : (
          <>
            <button className="actionbtn" onClick={() => setSheet(true)}>Night action</button>
            <button className="primary" onClick={submit}>Submit</button>
          </>
        )}
      </footer>
      {sheet && collecting && (
        <div className="sheet" onClick={() => setSheet(false)}>
          <div className="sheetbody" onClick={(e) => e.stopPropagation()}>
            <h3>Night action</h3>
            <ActionPicker specs={specs} names={names} value={choice} onChange={setChoice} dead={dead} />
            <div className="row">
              <button onClick={() => setSheet(false)}>Close</button>
              <button className="primary" disabled={!complete} onClick={submit}>Submit</button>
            </div>
          </div>
        </div>
      )}
      {roleOpen && (
        <div className="sheet" onClick={() => setRoleOpen(false)}>
          <div className="sheetbody" onClick={(e) => e.stopPropagation()}>
            <RoleCardView role={view.me.role} />
            <button onClick={() => setRoleOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RavenkeeperPrompt({ view, names, dead }: { view: PlayerView; names: Record<string, string>; dead: Set<string> }) {
  const [target, setTarget] = useState('');
  const options = view.seating.length ? view.seating : view.players.filter((p) => !p.isAdmin).map((p) => p.id);
  return (
    <div className="sheet">
      <div className="sheetbody">
        <h3>You have died.</h3>
        <p>Choose a player: you learn their character.</p>
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose…</option>
          {options.map((o) => <option key={o} value={o} style={dead.has(o) ? { color: '#ff6b6b' } : undefined}>{names[o]}</option>)}
        </select>
        <button className="primary big" disabled={!target} onClick={() => send({ type: 'submit_ravenkeeper', targetId: target })}>Submit</button>
      </div>
    </div>
  );
}

function DayScreen({ view, names }: { view: PlayerView; names: Record<string, string> }) {
  const results = view.me.messages.filter((m) => m.kind !== 'starting');
  return (
    <div className="pad">
      <div className="dawn">☀ Dawn — Day {view.dayNumber}</div>
      {!view.me.alive && (
        <div className="card dead">
          <b>You have died.</b>
          <p>You keep your role list, the night order and your role card.</p>
          {view.me.ghostVoteUsed
            ? <p className="muted">You have used your vote.</p>
            : (
              <div className="row wrap">
                <span>You have one vote left.</span>
                <button onClick={() => send({ type: 'use_ghost_vote' })}>I used my vote</button>
              </div>
            )}
        </div>
      )}
      <h3>Your information</h3>
      <Messages messages={results} emptyText="You learned nothing." />
      <p className="muted small">Discuss, nominate and vote at the table.</p>
    </div>
  );
}

function GameOver({ view }: { view: PlayerView }) {
  return (
    <div className="pad center">
      <h2>Game over</h2>
      <p>Thanks for playing, {view.me.name}.</p>
      <Messages messages={view.me.messages} />
    </div>
  );
}
