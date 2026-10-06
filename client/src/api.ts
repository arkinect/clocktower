import { useEffect, useState } from 'react';
import type { AdminView, Intent, PlayerView } from '@ct/shared';

export type View = PlayerView | AdminView;

const tokenKey = (code: string) => `ct_token_${code}`;

export function loadToken(code: string): string | null {
  try { return localStorage.getItem(tokenKey(code)); } catch { return null; }
}
export function saveToken(code: string, token: string | null) {
  try {
    if (token) localStorage.setItem(tokenKey(code), token);
    else localStorage.removeItem(tokenKey(code));
  } catch { /* private mode */ }
}

const PASSWORD_KEY = 'ct_site_password';
/** The shared game password (internet-facing instances only), remembered on this device. */
export function loadSitePassword(): string {
  try { return localStorage.getItem(PASSWORD_KEY) ?? ''; } catch { return ''; }
}
export function saveSitePassword(pw: string | null) {
  try { if (pw) localStorage.setItem(PASSWORD_KEY, pw); else localStorage.removeItem(PASSWORD_KEY); } catch { /* private mode */ }
}

export async function api<T = any>(code: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const pw = loadSitePassword();
  const res = await fetch(`/api/g/${encodeURIComponent(code)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { 'x-player-token': token } : {}),
      ...(pw ? { 'x-site-password': pw } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) return { ok: false, error: data?.error ?? `HTTP ${res.status}`, status: res.status, ...data } as T;
  return data as T;
}

type Toast = (msg: string) => void;
let toastFn: Toast = (m) => alert(m);
export function setToast(fn: Toast) { toastFn = fn; }
export function toast(msg: string) { toastFn(msg); }

let current: { code: string; token: string } | null = null;
export function setSession(code: string, token: string) { current = { code, token }; }

/** Send an intent. Shows a toast on error and resolves to the response. */
export async function send(intent: Intent): Promise<{ ok: boolean; error?: string; data?: any }> {
  if (!current) return { ok: false, error: 'Not connected' };
  const r = await api(current.code, '/intent', { intent }, current.token);
  if (!r.ok) toast(r.error ?? 'Request failed');
  return r;
}

/** WebSocket with automatic reconnect. The server sends a full view on connect and after every change. */
export function useGameSocket(code: string, token: string | null, onUnauthorized: () => void) {
  const [view, setView] = useState<View | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let timer: number | undefined;
    const connect = async () => {
      if (stopped) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/g/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { retry = 0; setConnected(true); };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'view') setView(msg.view);
        if (msg.type === 'removed') onUnauthorized();
      };
      ws.onclose = async () => {
        setConnected(false);
        if (stopped) return;
        // Check whether the token is still valid before retrying.
        const s = await api(code, '/session', undefined, token).catch(() => null);
        // 200 with ok:false means the server no longer knows this token.
        if (s && s.ok === false && !s.status) { onUnauthorized(); return; }
        retry++;
        timer = window.setTimeout(connect, Math.min(5000, 500 * retry));
      };
    };
    connect();
    const vis = () => { if (document.visibilityState === 'visible' && ws && ws.readyState > 1) { clearTimeout(timer); connect(); } };
    document.addEventListener('visibilitychange', vis);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', vis);
      ws?.close();
    };
  }, [code, token]);
  return { view, connected };
}
