// Upgrading saved games at startup (design.md section 5.5): older games are ended, migrated and saved in one
// transaction, after a one-off backup. The v4 fixtures were saved by the v0.2.2 engine (fixtures/generate-v4.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SCHEMA_VERSION, type GameState } from '@ct/shared';
import { Store } from '../src/db';
import { applyIntent, createGame } from '../src/engine/game';
import { adminView, playerView } from '../src/engine/views';
import { STEPS, type MigrationStep } from '../src/engine/migrations';
import { UpgradeRefused, upgradeSavedGames, upgradeSummary } from '../src/upgrade';

const HOUR = 60 * 60 * 1000;
const NOW = 100 * HOUR;
const fixture = (name: string): GameState => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
const release = { now: NOW, appVersion: '9.9.9 abc123' };

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

/** Save a fixture under its own code with one progress event at `progressAt`. */
function seed(name: string, code: string, progressAt: number, edit?: (s: GameState) => void): GameState {
  const s = { ...fixture(name), id: `game-${code}`, code };
  edit?.(s);
  store.save(s, [{ seq: 1, ts: progressAt, actor: null, type: 'start_night', payload: {} }]);
  return s;
}

/** A game already at this release's schema. */
function seedCurrent(code: string) {
  store.save(createGame(code, 0), [{ seq: 1, ts: 0, actor: null, type: 'game_created', payload: {} }]);
}

const loaded = (code: string) => store.loadAll().find((s) => s.code === code)!;
const snapshot = () => JSON.stringify({
  games: store.savedGames(), events: store.savedGames().map((g) => store.events(g.gameId)), migrations: store.migrations(),
});
const backups = () => fs.readdirSync(dir).filter((f) => f.includes('.pre-v'));

describe('startup upgrade', () => {
  it('upgrades each v4 fixture to the stored expected state', async () => {
    seed('v4-ended', 'fixture-ended', NOW - 50 * HOUR);
    seed('v4-mid-night', 'fixture-mid-night', NOW - 5 * HOUR);
    upgradeSavedGames(store, release);
    for (const name of ['ended', 'mid-night']) {
      await expect(JSON.stringify(loaded(`fixture-${name}`), null, 2) + '\n').toMatchFileSnapshot(`fixtures/v4-${name}.upgraded.json`);
    }
  });

  it('ends a mid-night game idle for 5 hours as abandoned, migrates it and logs one event', () => {
    seed('v4-mid-night', 'idle', NOW - 5 * HOUR);
    const r = upgradeSavedGames(store, release);
    expect(r).toEqual({ backupFile: `clocktower.db.pre-v${SCHEMA_VERSION}`, games: [{ code: 'idle', from: 4, endedReason: 'abandoned' }] });
    const s = loaded('idle');
    expect(s).toMatchObject({ phase: 'ENDED', endedReason: 'abandoned', night: null, nightEndsAt: null, schemaVersion: SCHEMA_VERSION });
    const ev = store.events(s.id);
    expect(ev).toHaveLength(2);
    expect(ev[0]).toMatchObject({ seq: 2, ts: NOW, actor: null, type: 'schema_migrated', payload: { from: 4, to: SCHEMA_VERSION, endedReason: 'abandoned' } });
  });

  it('ends a mid-night game with progress an hour ago as ended by the update', () => {
    seed('v4-mid-night', 'live', NOW - HOUR);
    upgradeSavedGames(store, release);
    const s = loaded('live');
    expect(s).toMatchObject({ phase: 'ENDED', endedReason: 'update', night: null });
    const pid = s.players.find((p) => !p.isAdmin)!.id;
    expect(playerView(s, pid, NOW).endedReason).toBe('update');
    expect(adminView(s, s.adminId!, NOW, {}).state.endedReason).toBe('update');
  });

  it('keeps an ended game as it was, and Play again works on it afterwards', () => {
    const before = seed('v4-ended', 'done', NOW - 50 * HOUR);
    expect(upgradeSavedGames(store, release)!.games).toEqual([{ code: 'done', from: 4, endedReason: null }]);
    const s = loaded('done');
    expect(s.endedReason).toBeNull();
    for (const k of ['players', 'assignments', 'story', 'days', 'messages'] as const) expect(s[k]).toEqual(before[k]);
    const { ravenkeeperExtensionSeconds, ...settings } = before.settings as typeof before.settings & { ravenkeeperExtensionSeconds: number };
    expect(s.settings).toEqual({ ...settings, followUpExtensionSeconds: ravenkeeperExtensionSeconds }); // renamed in v6
    const r = applyIntent(s, s.adminId!, { type: 'play_again' }, { now: NOW + 1 });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.phase).toBe('SETUP');
    expect(r.state.players.map((p) => p.id)).toEqual(before.players.map((p) => p.id));
    expect(r.state.script).toEqual(s.script);
  });

  it('backs up once, and a second startup changes nothing', () => {
    seed('v4-ended', 'a', 0);
    seed('v4-mid-night', 'b', 0);
    upgradeSavedGames(store, release);
    expect(backups()).toEqual([`clocktower.db.pre-v${SCHEMA_VERSION}`]);
    const after = snapshot();
    expect(upgradeSavedGames(store, { ...release, now: NOW + HOUR })).toBeNull();
    expect(snapshot()).toBe(after);
    expect(backups()).toEqual([`clocktower.db.pre-v${SCHEMA_VERSION}`]);
  });

  it('the backup holds the games as they were before the upgrade', () => {
    seed('v4-mid-night', 'b', 0);
    upgradeSavedGames(store, release);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-backup-'));
    fs.copyFileSync(path.join(dir, `clocktower.db.pre-v${SCHEMA_VERSION}`), path.join(other, 'clocktower.db'));
    const restored = new Store(other);
    expect(restored.loadAll()[0]).toMatchObject({ phase: 'NIGHT_RESOLVING', schemaVersion: 4 });
    expect(restored.events('game-b')).toHaveLength(1);
    restored.close();
    fs.rmSync(other, { recursive: true, force: true });
  });

  it('does not overwrite an existing backup', () => {
    seed('v4-ended', 'a', 0);
    const base = `clocktower.db.pre-v${SCHEMA_VERSION}`;
    fs.writeFileSync(path.join(dir, base), 'earlier');
    expect(upgradeSavedGames(store, release)!.backupFile).toBe(`${base}.${NOW}`);
    expect(fs.readFileSync(path.join(dir, base), 'utf8')).toBe('earlier');
  });

  it('a step that throws leaves the database unchanged and stops startup', () => {
    seed('v4-ended', 'a', 0);
    seed('v4-mid-night', 'b', 0);
    const before = snapshot();
    let calls = 0;
    const failOnSecond: MigrationStep = (s) => { if (++calls === 2) throw new Error('boom'); STEPS[5](s); };
    expect(() => upgradeSavedGames(store, { ...release, schemaVersion: 5, steps: { 5: failOnSecond } }))
      .toThrow(/game b from schema v4 failed at step v5: boom/);
    expect(snapshot()).toBe(before);
  });

  it('refuses a game saved by a newer release', () => {
    seed('v4-ended', 'a', 0, (s) => { s.schemaVersion = 99; });
    const before = snapshot();
    expect(() => upgradeSavedGames(store, release)).toThrow(UpgradeRefused);
    expect(() => upgradeSavedGames(store, release)).toThrow(/saved at schema v99, written by a newer release/);
    expect(snapshot()).toBe(before);
    expect(backups()).toEqual([]);
  });

  it('refuses a game older than this release supports', () => {
    seed('v4-ended', 'a', 0, (s) => { delete (s as Partial<GameState>).schemaVersion; });
    expect(() => upgradeSavedGames(store, release)).toThrow(
      'This database has games saved at schema v1, older than this release supports. Run v0.2.2 once to bring them to v4, then upgrade.');
    expect(backups()).toEqual([]);
  });

  it('does nothing when every game is current', () => {
    seedCurrent('c');
    const before = snapshot();
    expect(upgradeSavedGames(store, release)).toBeNull();
    expect(snapshot()).toBe(before);
    expect(backups()).toEqual([]);
  });
});

describe('upgrade log', () => {
  it('an upgrade writes one migrations row with the counts and backup name', () => {
    seed('v4-ended', 'a', 0);
    seed('v4-mid-night', 'b', NOW - 5 * HOUR);
    seed('v4-mid-night', 'c', NOW - HOUR);
    upgradeSavedGames(store, release);
    expect(store.migrations()).toEqual([{
      id: 1, appliedAt: NOW, appVersion: '9.9.9 abc123', toSchema: SCHEMA_VERSION, gamesMigrated: 3, gamesEnded: 2,
      backupFile: `clocktower.db.pre-v${SCHEMA_VERSION}`,
      details: [
        { code: 'a', from: 4, endedReason: null },
        { code: 'b', from: 4, endedReason: 'abandoned' },
        { code: 'c', from: 4, endedReason: 'update' },
      ],
    }]);
  });

  it('a startup with nothing to upgrade, or a failed one, writes no row', () => {
    seedCurrent('c');
    upgradeSavedGames(store, release);
    seed('v4-ended', 'a', 0);
    expect(() => upgradeSavedGames(store, { ...release, steps: { 5: () => { throw new Error('boom'); } } })).toThrow();
    expect(store.migrations()).toEqual([]);
  });

  it('summarises the upgrade in one startup line', () => {
    const r = (...reasons: ('abandoned' | 'update' | null)[]) =>
      ({ backupFile: 'clocktower.db.pre-v5', games: reasons.map((endedReason, i) => ({ code: `g${i}`, from: 4, endedReason })) });
    expect(upgradeSummary(r(null, 'abandoned'), 5)).toBe('Upgraded 2 games to schema v5 (1 ended: abandoned). Backup: clocktower.db.pre-v5.');
    expect(upgradeSummary(r(null), 5)).toBe('Upgraded 1 game to schema v5. Backup: clocktower.db.pre-v5.');
    expect(upgradeSummary(r('abandoned', 'update', 'abandoned'), 5))
      .toBe('Upgraded 3 games to schema v5 (3 ended: 2 abandoned, 1 update). Backup: clocktower.db.pre-v5.');
  });
});
