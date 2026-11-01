// When an update may restart the server (design.md section 5.5): last progress, abandoned games, the status reply.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SCHEMA_VERSION, type GameState } from '@ct/shared';
import { Store } from '../src/db';
import { createGame } from '../src/engine/game';
import { ABANDONED_AFTER_MS, isLoopback, upgradeStatus } from '../src/upgrade';

const HOUR = 60 * 60 * 1000;
let dir: string;
let store: Store;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-upgrade-'));
  store = new Store(dir);
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function saved(code: string, phase: GameState['phase'], createdAt: number, events: [number, string][]): GameState {
  const s = { ...createGame(code, createdAt), phase };
  store.save(s, events.map(([ts, type], i) => ({ seq: i + 1, ts, actor: null, type, payload: {} })));
  return s;
}

describe('last progress', () => {
  it('ignores join and rebind events', () => {
    const s = saved('a', 'DAY', 0, [[1000, 'game_created'], [2000, 'start_night'], [3000, 'join'], [4000, 'rebind']]);
    expect(store.lastProgressAt(s.id)).toBe(2000);
  });

  it('is null without a qualifying event, and the status falls back to createdAt', () => {
    const s = saved('a', 'LOBBY', 500, [[3000, 'join']]);
    expect(store.lastProgressAt(s.id)).toBeNull();
    expect(upgradeStatus(store, [s], 600).games[0].lastProgressAt).toBe(500);
  });
});

describe('upgrade status', () => {
  const now = 10 * HOUR;

  it('is safe when every game is ended or abandoned', () => {
    const ended = saved('e', 'ENDED', 0, [[now - HOUR, 'end_game']]);
    const idle = saved('i', 'NIGHT_RESOLVING', 0, [[now - ABANDONED_AFTER_MS, 'start_night'], [now - 1, 'rebind']]);
    const st = upgradeStatus(store, [ended, idle], now);
    expect(st).toEqual({
      schemaVersion: SCHEMA_VERSION,
      games: [
        { code: 'e', phase: 'ENDED', lastProgressAt: now - HOUR, abandoned: false },
        { code: 'i', phase: 'NIGHT_RESOLVING', lastProgressAt: now - ABANDONED_AFTER_MS, abandoned: true },
      ],
      safeToRestart: true,
    });
  });

  it('is not safe while a game made progress in the last 4 hours', () => {
    const live = saved('l', 'DAY', 0, [[now - 4 * HOUR + 1, 'record_execution']]);
    const st = upgradeStatus(store, [live], now);
    expect(st.games[0].abandoned).toBe(false);
    expect(st.safeToRestart).toBe(false);
  });

  it('gives no player details', () => {
    const s = saved('p', 'LOBBY', 0, []);
    s.players.push({ name: 'Secret' } as GameState['players'][number]);
    expect(JSON.stringify(upgradeStatus(store, [s], now))).not.toContain('Secret');
  });
});

describe('loopback check', () => {
  it('accepts only the loopback interface', () => {
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) expect(isLoopback(a)).toBe(true);
    for (const a of ['172.18.0.3', '::ffff:172.18.0.3', '10.0.0.1', '', undefined]) expect(isLoopback(a)).toBe(false);
  });
});
