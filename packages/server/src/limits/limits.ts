// Client addresses, token buckets and the wrong-password backoff. Time always comes in as an argument.

const plain = (ip: string) => ip.replace(/^::ffff:/, '');

/**
 * The client's address. Caddy overwrites X-Forwarded-For with the real peer, so the header is believed only when the
 * connection comes from Caddy. If this is wrong, limits hit the whole table or can be dodged.
 */
export function clientIp(
  peer: string | undefined,
  forwarded: string | string[] | undefined,
  trusted: readonly string[],
) {
  const socket = plain(peer ?? 'unknown');
  if (!trusted.includes(socket)) return socket;
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = header?.split(',')[0]?.trim();
  return first ? plain(first) : socket;
}

export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly rate: number,
    private readonly burst: number,
    now: number,
  ) {
    this.tokens = burst;
    this.last = now;
  }

  take(now: number): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** One bucket per key, forgotten once idle, so a flood of addresses cannot fill memory. */
export class BucketMap {
  private buckets = new Map<string, { bucket: TokenBucket; seen: number }>();

  constructor(
    private readonly rate: number,
    private readonly burst: number,
    private readonly maxKeys = 50_000,
  ) {}

  take(key: string, now: number): boolean {
    let row = this.buckets.get(key);
    if (!row) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      row = { bucket: new TokenBucket(this.rate, this.burst, now), seen: now };
      this.buckets.set(key, row);
    }
    row.seen = now;
    return row.bucket.take(now);
  }

  private sweep(now: number) {
    const idle = (this.burst / this.rate) * 1000;
    for (const [k, v] of this.buckets) if (now - v.seen > idle) this.buckets.delete(k);
    if (this.buckets.size >= this.maxKeys) this.buckets.clear();
  }
}

/** No bans: wrong passwords wait longer each time, per address, so nobody can lock out the table. */
export class PasswordBackoff {
  private rows = new Map<string, { failures: number; until: number }>();

  constructor(
    private readonly startMs: number,
    private readonly maxMs: number,
    private readonly maxKeys = 50_000,
  ) {}

  /** Milliseconds this address must still wait. */
  wait(ip: string, now: number): number {
    const row = this.rows.get(ip);
    return row ? Math.max(0, row.until - now) : 0;
  }

  fail(ip: string, now: number): number {
    if (this.rows.size >= this.maxKeys) {
      for (const [k, v] of this.rows) if (v.until < now) this.rows.delete(k);
      if (this.rows.size >= this.maxKeys) this.rows.clear();
    }
    const failures = (this.rows.get(ip)?.failures ?? 0) + 1;
    const delay = Math.min(this.maxMs, this.startMs * 2 ** (failures - 1));
    this.rows.set(ip, { failures, until: now + delay });
    return delay;
  }

  reset(ip: string) {
    this.rows.delete(ip);
  }
}
