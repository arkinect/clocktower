import { useCallback, useEffect, useState } from 'react';
import { api, loadToken, saveToken, setSession, setToast, useGameSocket } from './api';
import { Join } from './Join';
import { PlayerApp } from './player/PlayerApp';
import { AdminApp } from './admin/AdminApp';

function gameCodeFromPath(): string {
  const m = location.pathname.match(/^\/g\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : 'default';
}

export function App() {
  const code = gameCodeFromPath();
  const [token, setToken] = useState<string | null>(() => loadToken(code));
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let t: number | undefined;
    setToast((m) => { setToastMsg(m); clearTimeout(t); t = window.setTimeout(() => setToastMsg(null), 4000); });
  }, []);

  // A token may be missing from localStorage but still present as a cookie: ask the server.
  useEffect(() => {
    if (token) { setChecked(true); return; }
    api(code, '/session').then((r) => {
      if (r.ok && r.playerId) {
        // Cookie is HttpOnly so we cannot read the token: rebind to get a fresh one.
        api(code, '/rebind', { playerId: r.playerId }).then((rb) => {
          if (rb.ok) { saveToken(code, rb.token); setToken(rb.token); }
          setChecked(true);
        });
      } else setChecked(true);
    }).catch(() => setChecked(true));
  }, [code]);

  if (token) setSession(code, token);
  const logout = useCallback(() => { saveToken(code, null); setToken(null); }, [code]);
  const { view, connected } = useGameSocket(code, token, logout);

  let body;
  if (!checked) body = <div className="center muted">Loading…</div>;
  else if (!token) body = <Join code={code} onJoined={(t) => { saveToken(code, t); setToken(t); }} />;
  else if (!view) body = <div className="center muted">Connecting…</div>;
  else if (view.kind === 'admin') body = <AdminApp view={view} code={code} />;
  else body = <PlayerApp view={view} />;

  return (
    <>
      {token && !connected && view && <div className="offline">Reconnecting…</div>}
      {body}
      {toastMsg && <div className="toast" onClick={() => setToastMsg(null)}>{toastMsg}</div>}
    </>
  );
}
