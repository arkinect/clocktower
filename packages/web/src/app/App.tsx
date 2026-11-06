import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Join } from '../player/Join';
import { PlayerApp } from '../player/PlayerApp';
import { Banner, UpdateBar } from '../ui/ui';
import { api, sessionFor } from './http';
import { navigate, parseRoute, usePath, type Route } from './router';
import { GameProvider, ToastProvider, useGame } from './store';

const Console = lazy(() => import('../storyteller/Console'));

function Screens({ route, onSignedOut }: { route: Route; onSignedOut: () => void }) {
  const { view, status, reload, signedOut } = useGame();
  useEffect(() => {
    if (signedOut) onSignedOut();
  }, [signedOut, onSignedOut]);
  const isStoryteller = view?.kind === 'storyteller';
  useEffect(() => {
    if (!view) return;
    const base = `/g/${encodeURIComponent(route.code)}`;
    if (isStoryteller && !route.storyteller) navigate(`${base}/storyteller`, true);
    if (!isStoryteller && route.storyteller) navigate(base, true);
  }, [view, isStoryteller, route]);
  return (
    <>
      {status === 'offline' && <Banner tone="warn">Reconnecting…</Banner>}
      {reload && <UpdateBar />}
      {!view && <p className="pad muted">Connecting…</p>}
      {view?.kind === 'player' && <PlayerApp view={view} />}
      {view?.kind === 'storyteller' && (
        <Suspense fallback={<p className="pad muted">Loading…</p>}>
          <Console view={view} tab={route.tab} />
        </Suspense>
      )}
    </>
  );
}

export function App() {
  const route = parseRoute(usePath());
  const [config, setConfig] = useState<{ buildId: string; passwordRequired: boolean; defaultGame: string } | null>(
    null,
  );
  const [session, setSession] = useState<string | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const code = route?.code ?? null;

  useEffect(() => {
    const ask = () =>
      void api.config().then((r) => {
        if (r.ok && r.data) setConfig(r.data);
        else window.setTimeout(ask, 2000);
      });
    ask();
  }, []);
  useEffect(() => {
    if (config && !code) navigate(`/g/${encodeURIComponent(config.defaultGame)}`, true);
  }, [config, code]);
  useEffect(() => {
    if (!code) return;
    setSession(undefined);
    let live = true;
    // The server may be restarting: keep asking until it can say who this phone is.
    const ask = () =>
      void sessionFor(code).then((s) => {
        if (!live) return;
        if (s === undefined) window.setTimeout(ask, 2000);
        else setSession(s);
      });
    ask();
    return () => {
      live = false;
    };
  }, [code]);

  const signedOut = useCallback(() => {
    setSession(null);
    setNotice('You are no longer in this game. Join again to carry on.');
  }, []);

  if (!config || !route || session === undefined) return <p className="pad muted">Loading…</p>;
  return (
    <ToastProvider>
      {session === null ? (
        <Join
          code={route.code}
          passwordRequired={config.passwordRequired}
          notice={notice}
          onJoined={(id) => {
            setNotice(null);
            setSession(id);
          }}
        />
      ) : (
        <GameProvider key={session} code={route.code} buildId={config.buildId}>
          <Screens route={route} onSignedOut={signedOut} />
        </GameProvider>
      )}
    </ToastProvider>
  );
}
