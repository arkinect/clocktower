// Session tokens: 256 random bits, stored only as SHA-256 hashes, sent only as an HttpOnly cookie.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Store } from '../store/store';

export const COOKIE = 'ct_session';

/**
 * How long a session lasts, counted from when it was issued and not from when it was last used. The cookie is given
 * the same age, so a browser forgets it when the server does: 30 days after joining, a player joins again.
 */
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

/** Sessions one player may hold at once: more devices than anyone brings. One more retires the oldest. */
export const SESSIONS_PER_PLAYER = 8;

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export interface Session {
  hash: string;
  code: string;
  playerId: string;
  createdAt: number;
}

export function readCookie(header: string | undefined, name = COOKIE): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === name && v) return v;
  }
  return null;
}

export function cookieHeader(token: string, secure: boolean) {
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${SESSION_SECONDS}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** The hashes live in memory, so looking one up never touches SQLite. */
export class Sessions {
  private byHash = new Map<string, Session>();

  constructor(
    private readonly store: Store,
    now = Date.now(),
  ) {
    store.pruneSessions(now - SESSION_SECONDS * 1000);
    for (const s of store.sessions()) this.byHash.set(s.hash, s);
  }

  issue(code: string, playerId: string, now: number): string {
    const token = randomBytes(32).toString('base64url');
    const hash = sha256(token).toString('hex');
    this.byHash.set(hash, { hash, code, playerId, createdAt: now });
    this.store.addSession({ hash, code, playerId, createdAt: now });
    // Rejoining always issues a new session, so without a cap one player's rows would grow for ever.
    const own = [...this.byHash.values()].filter((s) => s.code === code && s.playerId === playerId);
    for (const old of own.slice(0, Math.max(0, own.length - SESSIONS_PER_PLAYER))) this.forget(old.hash);
    return token;
  }

  find(token: string | null, now = Date.now()): Session | null {
    if (!token) return null;
    const s = this.byHash.get(sha256(token).toString('hex'));
    if (!s) return null;
    if (now - s.createdAt <= SESSION_SECONDS * 1000) return s;
    this.forget(s.hash);
    return null;
  }

  private forget(hash: string) {
    this.byHash.delete(hash);
    this.store.dropSession(hash);
  }

  drop(code: string, playerId: string) {
    for (const [h, s] of this.byHash) if (s.code === code && s.playerId === playerId) this.byHash.delete(h);
    this.store.dropSessions(code, playerId);
  }

  dropGame(code: string) {
    for (const [h, s] of this.byHash) if (s.code === code) this.byHash.delete(h);
  }
}

export function passwordMatches(given: unknown, password: string): boolean {
  return typeof given === 'string' && timingSafeEqual(sha256(given), sha256(password));
}
