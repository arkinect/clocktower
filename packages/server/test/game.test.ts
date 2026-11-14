import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '@ct/protocol';
import { ENGINE_VERSION } from '@ct/rules';
import { Games, IDLE_MS, type LiveGame } from '../src/games/manager';
import { Store } from '../src/store/store';
import {
  Client,
  connect,
  dial,
  firstChoices,
  join,
  open,
  start,
  table,
  testConfig,
  type Harness,
} from './helpers/client';

const opened: Harness[] = [];
const up = async (config = testConfig()) => {
  const h = await start(config);
  opened.push(h);
  return h;
};

afterEach(async () => {
  for (const h of opened.splice(0)) await h.app.close();
});

async function night(st: Client, players: Client[], n: number) {
  await st.until((v) => v.phase.kind === 'night' && v.phase.n === n && v.phase.stage === 'collecting');
  for (const p of players) {
    if (!p.me.me.alive) continue;
    const view = await p.until((v) => v.phase.stage === 'collecting');
    if (view.kind === 'player') await p.do({ type: 'submit_night', actions: firstChoices(view) });
  }
  await st.do({ type: 'close_collecting', force: true });
  await st.until((v) => v.phase.stage === 'review');
  await st.do({ type: 'accept_all_defaults' });
  await st.do({ type: 'publish_dawn', force: true });
  await st.until((v) => v.phase.kind === 'day');
}

describe('a headless game over sockets', () => {
  it('plays from lobby to ended, every phone seeing only its own view', async () => {
    const h = await up();
    const { st, players } = await table(h);
    const [ann, , , di, ed] = players as [Client, Client, Client, Client, Client];

    await st.do({ type: 'begin_first_night', force: true });
    await st.until((v) => v.phase.kind === 'night');
    await ann.until((v) => v.phase.kind === 'night');
    await ann.do({ type: 'seen_role' });
    expect(ann.me.me.role?.roleId).toBe('clockmaker');
    expect(ann.me.me.messages.some((m) => m.title === 'Demon information')).toBe(false);
    await st.do({ type: 'open_collecting' });
    await night(st, players, 0);

    await st.do({ type: 'record_nomination', nominator: ann.id as PlayerId, nominee: di.id as PlayerId });
    await st.do({ type: 'record_vote', nominee: di.id as PlayerId, count: 3, voters: null });
    // Executed as the night starts.
    await st.do({ type: 'record_execution', playerId: di.id as PlayerId, died: true });
    await st.do({ type: 'start_night' });
    await di.until((v) => v.kind === 'player' && !v.me.alive);
    await night(st, players, 1);

    await st.do({ type: 'record_execution', playerId: ed.id as PlayerId, died: true });
    await st.do({ type: 'start_night' });
    const end = await st.until((v) => v.kind === 'storyteller' && v.gameEnd.length > 0);
    if (end.kind !== 'storyteller') throw new Error('Expected the grimoire');
    await st.do({ type: 'confirm_game_end', key: end.gameEnd[0]!.key });
    await ann.until((v) => v.phase.kind === 'ended');
    expect(ann.me.phase.winner).toBe('good');

    // A player's socket never carries the grimoire.
    for (const p of players) {
      expect(p.raw.some((m) => m.includes('"kind":"storyteller"'))).toBe(false);
    }
  });

  it('does not resend a view that has not changed', async () => {
    const h = await up();
    const { players } = await table(h);
    const ann = players[0] as Client;
    const views = () => ann.raw.filter((m) => m.includes('"type":"view"')).length;
    const before = views();
    await ann.send({ type: 'use_ghost_vote' });
    await new Promise((r) => setTimeout(r, 50));
    expect(views()).toBe(before);
  });

  it('shows presence to the Storyteller only', async () => {
    const h = await up();
    const { st, players } = await table(h);
    const count = () => st.grim.players.filter((p) => p.connected).length;
    await st.until(() => count() === 5);
    players[0]?.close();
    await st.until(() => count() === 4);
    expect(players[1]?.raw.join('')).not.toContain('"connected"');
  });

  it('removing a player ends their session and socket', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const bo = await connect(h, 'Bo');
    await st.do({ type: 'remove_player', playerId: bo.id as PlayerId });
    await bo.until(() => false, 200).catch(() => undefined);
    expect(bo.raw.some((m) => m.includes('"type":"removed"'))).toBe(true);
    await expect(open(h, { origin: h.base, cookie: bo.cookie })).rejects.toThrow('401');
  });

  it('New game (erase) signs out everyone, the Storyteller included', async () => {
    const h = await up();
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const bo = await connect(h, 'Bo');
    // The socket closes before the ack, so the Storyteller's phone never waits for one.
    void st.send({ type: 'new_game' }).catch(() => undefined);
    for (const c of [st, bo]) {
      await c.until(() => false, 300).catch(() => undefined);
      expect(c.raw.some((m) => m.includes('"type":"removed"'))).toBe(true);
      await expect(open(h, { origin: h.base, cookie: c.cookie })).rejects.toThrow('401');
    }
    expect(h.app.games.get('default')!.state).toMatchObject({
      players: {},
      storytellerId: null,
      phase: { kind: 'lobby' },
    });
  });
});

describe('restart', () => {
  it('restores games and sessions', async () => {
    const config = testConfig();
    const h = await start(config);
    const { st, players } = await table(h);
    await st.do({ type: 'begin_first_night', force: true });
    const cookie = (players[0] as Client).cookie;
    const before = JSON.stringify(h.app.games.get('default')!.state);
    await h.app.close();

    const again = await up(config);
    expect(JSON.stringify(again.app.games.get('default')!.state)).toBe(before);
    const c = await dial(again, cookie, players[0]!.id);
    await c.until((v) => v.phase.kind === 'night');
    expect(c.me.me.role?.roleId).toBe('clockmaker');
  });

  async function tamper(config: ReturnType<typeof testConfig>, change: (store: Store, snapshot: string) => void) {
    const h = await start(config);
    await join(h, 'Ann');
    const snapshot = h.app.store.games()[0]!.snapshot;
    await h.app.close();
    const store = new Store(config.dataDir);
    change(store, snapshot);
    store.close();
    return up(config);
  }

  it('archives a game from another engine version and starts a fresh lobby', async () => {
    const h = await tamper(testConfig(), (s, snap) => s.save('default', ENGINE_VERSION + 1, snap, 2, null));
    expect(h.app.store.archived()).toEqual([{ code: 'default', reason: `engine ${ENGINE_VERSION + 1}` }]);
    expect(Object.keys(h.app.games.get('default')!.state.players)).toEqual([]);
    expect(h.app.store.log('default')).toEqual([]);
  });

  it('archives a snapshot that fails to parse', async () => {
    const h = await tamper(testConfig(), (s) => s.save('default', ENGINE_VERSION, '{"not":"a game"}', 2, null));
    expect(h.app.store.archived()).toEqual([{ code: 'default', reason: 'snapshot failed the schema' }]);
    const broken = await tamper(testConfig(), (s) => s.save('default', ENGINE_VERSION, '{{{', 2, null));
    expect(broken.app.store.archived()).toEqual([{ code: 'default', reason: 'unreadable snapshot' }]);
  });

  it('keeps the newest archives only', () => {
    const store = new Store(':memory:');
    for (let i = 0; i < 25; i++) store.archive({ code: `g${i}`, engine: 1, snapshot: '{}' }, 'test', i, 20);
    expect(store.archived()).toHaveLength(20);
    expect(store.archived()[0]?.code).toBe('g5');
    store.close();
  });

  it('an idle game gives up its slot, the default game never', () => {
    const limits = { ...testConfig().limits, liveGames: 2 };
    const audit = { command: () => undefined, failed: () => undefined };
    let now = 0;
    const store = new Store(':memory:');
    const games = new Games(
      store,
      limits,
      () => undefined,
      () => undefined,
      audit,
      'default',
      () => now,
    );
    games.ensure('default');
    const other = games.ensure('other') as LiveGame;
    expect(games.ensure('third')).toBeNull();
    other.lastActivity = 0;
    now = IDLE_MS + 1;
    expect(games.ensure('third')?.code).toBe('third');
    expect(games.get('other')).toBeUndefined();
    expect(games.get('default')).toBeDefined();
    expect(store.archived()).toEqual([{ code: 'other', reason: 'idle' }]);
    store.close();
  });

  it('exports the command log with the engine version', async () => {
    const h = await up();
    const { st, players } = await table(h);
    const res = await fetch(`${h.base}/api/g/default/export`, { headers: { cookie: st.cookie } });
    const body = (await res.json()) as { engineVersion: number; log: { command: { type: string } }[] };
    expect(body.engineVersion).toBe(ENGINE_VERSION);
    expect(body.log[0]?.command.type).toBe('join');
    const denied = await fetch(`${h.base}/api/g/default/export`, { headers: { cookie: players[0]!.cookie } });
    expect(denied.status).toBe(403);
  });
});

describe('the command limit', () => {
  const settle = (game: LiveGame, id: string) =>
    game.submit(id as PlayerId, { type: 'set_settings', announceDeaths: true });

  it('counts one game at a time: a full game still takes New game, and the next starts from nothing', async () => {
    const config = testConfig({}, { commandsPerGame: 6 });
    const h = await up(config);
    const st = await connect(h, 'Storyteller', { wantsStoryteller: true });
    const game = h.app.games.get('default') as LiveGame;
    // The join was the first command of six.
    for (let i = 0; i < 5; i++) expect((await settle(game, st.id)).ok).toBe(true);
    expect(await settle(game, st.id)).toEqual({ ok: false, error: 'This game has reached its command limit.' });
    expect((await game.submit(st.id as PlayerId, { type: 'new_game' })).ok).toBe(true);

    const next = await connect(h, 'Storyteller', { wantsStoryteller: true });
    for (let i = 0; i < 2; i++) expect((await settle(game, next.id)).ok).toBe(true);
    // The log still holds both games, for the export.
    expect(h.app.store.log('default')).toHaveLength(10);

    // A restart picks the count up where it was: three commands into the second game, not ten into the log.
    await h.app.close();
    opened.splice(opened.indexOf(h), 1);
    const again = await up(config);
    const restored = again.app.games.get('default') as LiveGame;
    for (let i = 0; i < 3; i++) expect((await settle(restored, next.id)).ok).toBe(true);
    expect((await settle(restored, next.id)).ok).toBe(false);
  });
});
