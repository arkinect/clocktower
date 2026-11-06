// The few calls made before a socket exists. The session is an HttpOnly cookie this code never sees.
import type { ConfigResponse, JoinRequest, RejoinRequest } from '@ct/protocol';

export interface HttpResult<T> {
  ok: boolean;
  status: number;
  error?: string;
  retryMs?: number;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<HttpResult<T>> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', ...init });
    const body = (await res.json()) as T & { error?: string; retryMs?: number };
    return {
      ok: res.ok,
      status: res.status,
      ...(body.error ? { error: body.error } : {}),
      ...(body.retryMs ? { retryMs: body.retryMs } : {}),
      data: body,
    };
  } catch {
    return { ok: false, status: 0, error: 'Cannot reach the server.' };
  }
}

const post = <T>(url: string, body: unknown) =>
  call<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export interface NameRow {
  id: string;
  name: string;
  isStoryteller: boolean;
}

export const api = {
  config: () => call<ConfigResponse>('/api/config'),
  names: (code: string, password: string) =>
    call<{ players: NameRow[]; hasStoryteller: boolean }>(`/api/g/${encodeURIComponent(code)}/names`, {
      headers: password ? { 'x-site-password': password } : {},
    }),
  join: (code: string, body: JoinRequest) =>
    post<{ playerId: string }>(`/api/g/${encodeURIComponent(code)}/join`, body),
  rejoin: (code: string, body: RejoinRequest) =>
    post<{ playerId: string }>(`/api/g/${encodeURIComponent(code)}/rejoin`, body),
};

/** Who this cookie makes us in this game: null if nobody, undefined if the server could not say. */
export async function sessionFor(code: string): Promise<string | null | undefined> {
  const r = await call<{ playerId: string | null }>(`/api/g/${encodeURIComponent(code)}/session`);
  return r.ok ? (r.data?.playerId ?? null) : undefined;
}
