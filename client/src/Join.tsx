import { useEffect, useState } from 'react';
import type { RolePreference } from '@ct/shared';
import { api, loadSitePassword, saveSitePassword } from './api';

interface Names { ok: boolean; hasAdmin: boolean; phase: string; players: { id: string; name: string; isAdmin: boolean }[] }

export function Join({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const [name, setName] = useState('');
  const [pref, setPref] = useState<RolePreference>('none');
  const [wantsAdmin, setWantsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [names, setNames] = useState<Names | null>(null);
  const [busy, setBusy] = useState(false);
  // Internet-facing instances ask for the shared game password before showing anything else.
  const [needPw, setNeedPw] = useState(false);
  const [pw, setPw] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwTick, setPwTick] = useState(0);

  useEffect(() => {
    api<Names & { passwordRequired?: boolean; error?: string }>(code, '/names').then((r) => {
      if (r.passwordRequired) {
        if (loadSitePassword()) { saveSitePassword(null); setPwError(r.error ?? 'Wrong password.'); }
        setNeedPw(true);
        return;
      }
      setNeedPw(false);
      setNames(r);
    }).catch(() => {});
  }, [code, mode, pwTick]);

  const submitPw = () => {
    if (!pw.trim()) return;
    saveSitePassword(pw.trim());
    setPwError(null);
    setPwTick((t) => t + 1);
  };

  if (needPw) {
    return (
      <div className="join">
        <h1 className="title">Clocktower<br /><span>Night Assistant</span></h1>
        <div className="card">
          <p>This game is private. Enter the password from your Storyteller.</p>
          <label>Password
            <input type="password" value={pw} autoFocus onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitPw(); }} />
          </label>
          {pwError && <div className="error">{pwError}</div>}
          <button className="primary big" disabled={!pw.trim()} onClick={submitPw}>Continue</button>
        </div>
      </div>
    );
  }

  const join = async () => {
    setBusy(true);
    setError(null);
    const r = await api(code, '/join', { name, rolePreference: pref, wantsAdmin: wantsAdmin && !names?.hasAdmin });
    setBusy(false);
    if (r.passwordRequired) { saveSitePassword(null); setNeedPw(true); return; }
    if (!r.ok) { setError(r.error); return; }
    if (r.notice) { setNotice(r.notice); setTimeout(() => onJoined(r.token), 2500); }
    else onJoined(r.token);
  };

  const rebind = async (playerId: string) => {
    const r = await api(code, '/rebind', { playerId });
    if (r.passwordRequired) { saveSitePassword(null); setNeedPw(true); return; }
    if (!r.ok) { setError(r.error); return; }
    onJoined(r.token);
  };

  return (
    <div className="join">
      <h1 className="title">Clocktower<br /><span>Night Assistant</span></h1>
      <div className="seg">
        <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>Join</button>
        <button className={mode === 'existing' ? 'on' : ''} onClick={() => setMode('existing')}>I'm already in this game</button>
      </div>
      {notice && <div className="card notice">{notice}</div>}
      {mode === 'new' ? (
        <div className="card">
          <label>Your name
            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus />
          </label>
          <label>Role type you'd like
            <select value={pref} onChange={(e) => setPref(e.target.value as RolePreference)}>
              <option value="none">No preference</option>
              <option value="townsfolk">Townsfolk</option>
              <option value="outsider">Outsider</option>
              <option value="minion">Minion</option>
              <option value="demon">Demon</option>
            </select>
          </label>
          {/* Only offered while nobody is the Storyteller yet. */}
          {names && !names.hasAdmin && (
            <label className="check">
              <input type="checkbox" checked={wantsAdmin} onChange={(e) => setWantsAdmin(e.target.checked)} />
              I am the admin (Storyteller)
            </label>
          )}
          {error && <div className="error">{error}</div>}
          <button className="primary big" disabled={busy || !name.trim()} onClick={join}>Join game</button>
        </div>
      ) : (
        <div className="card">
          <p className="muted">Pick your name to continue on this device.</p>
          {error && <div className="error">{error}</div>}
          <div className="namelist">
            {names?.players.length ? names.players.map((p) => (
              <button key={p.id} onClick={() => rebind(p.id)}>{p.name}{p.isAdmin ? ' (Storyteller)' : ''}</button>
            )) : <p className="muted">Nobody has joined yet.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
