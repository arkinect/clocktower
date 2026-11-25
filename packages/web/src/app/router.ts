// Tabs are URLs, so they survive reloads. /g/:code is the player app, /g/:code/storyteller/* and
// /g/:code/steward/* the consoles.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(l: () => void) {
  listeners.add(l);
  window.addEventListener('popstate', l);
  return () => {
    listeners.delete(l);
    window.removeEventListener('popstate', l);
  };
}

export const usePath = () => useSyncExternalStore(subscribe, () => location.pathname);

export function navigate(path: string, replace = false) {
  if (path === location.pathname) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  for (const l of listeners) l();
}

export interface Route {
  code: string;
  console: 'storyteller' | 'steward' | null;
  tab: string | null;
}

export function parseRoute(path: string): Route | null {
  const m = /^\/g\/([^/]+)(?:\/(storyteller|steward)(?:\/([^/]+))?)?\/?$/.exec(path);
  if (!m) return null;
  return { code: decodeURIComponent(m[1] as string), console: (m[2] as Route['console']) ?? null, tab: m[3] ?? null };
}
