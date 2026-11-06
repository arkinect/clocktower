// Session tokens: 256 random bits, stored only as SHA-256 hashes, sent only as an HttpOnly cookie.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Store } from '../store/store';

export const COOKIE = 'ct_session';

const sha256 = (s: string) => createHash('sha256').update(s).digest();

export interface Session {
  hash: string;
  code: string;
  playerId: string;
}

export function readCookie(header: string | undefined, name = COOKIE): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === name && v) return v;
  }
  return null;
}

export function cookieHeader(token: string, secure: boolean) {
  const parts = [`${COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=2592000'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** The hashes live in memory, so looking one up never touches SQLite. */
export class Sessions {
  private byHash = new Map<string, Session>();

  constructor(private readonly store: Store) {
    for (const s of store.sessions()) this.byHash.set(s.hash, s);
  }

  issue(code: string, playerId: string, now: number): string {
    const token = randomBytes(32).toString('base64url');
    const hash = sha256(token).toString('hex');
    this.byHash.set(hash, { hash, code, playerId });
    this.store.addSession({ hash, code, playerId, createdAt: now });
    return token;
  }

  find(token: string | null): Session | null {
    if (!token) return null;
    return this.byHash.get(sha256(token).toString('hex')) ?? null;
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
