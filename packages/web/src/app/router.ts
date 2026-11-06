// Tabs are URLs, so they survive reloads. /g/:code is the player app, /g/:code/storyteller/* the console.
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
  storyteller: boolean;
  tab: string | null;
}

export function parseRoute(path: string): Route | null {
  const m = /^\/g\/([^/]+)(?:\/(storyteller)(?:\/([^/]+))?)?\/?$/.exec(path);
  if (!m) return null;
  return { code: decodeURIComponent(m[1] as string), storyteller: !!m[2], tab: m[3] ?? null };
}
