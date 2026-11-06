import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Join } from '../player/Join';
import { PlayerApp } from '../player/PlayerApp';
import { Banner, Button } from '../ui/ui';
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
      {reload && (
        <Banner tone="gold">
          A new version is ready.{' '}
          <Button tiny onClick={() => location.reload()}>
            Reload
          </Button>
        </Banner>
      )}
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
    void api.config().then((r) => r.data && setConfig(r.data));
  }, []);
  useEffect(() => {
    if (config && !code) navigate(`/g/${encodeURIComponent(config.defaultGame)}`, true);
  }, [config, code]);
  useEffect(() => {
    if (!code) return;
    setSession(undefined);
    void sessionFor(code).then(setSession);
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
