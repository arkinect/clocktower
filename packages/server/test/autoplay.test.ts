// Autoplay over sockets: the server takes the steps nobody should take by hand, and the steward is sent no more than
// the table knows.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { roleId, type PlayerId, type RoleId, type StewardView } from '@ct/protocol';
import { defineRole, registerRole } from '@ct/rules';
import { Client, connect, dial, firstChoices, start, testConfig, type Harness } from './helpers/client';

const opened: Harness[] = [];
const up = async (config = testConfig()) => {
  const h = await start(config);
  opened.push(h);
  return h;
};

/** The wall clock, moved on. Timers are left alone. */
const realNow = Date.now.bind(Date);
let ahead = 0;
const wait = (seconds: number) => {
  ahead += seconds * 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => realNow() + ahead);
};

afterEach(async () => {
  vi.restoreAllMocks();
  ahead = 0;
  for (const h of opened.splice(0)) await h.app.close();
});

const bad = defineRole({
  id: 't-bad' as RoleId,
  name: 'Bad',
  type: 'townsfolk',
  autoplay: true,
  abilityText: 'Breaks the night.',
  night: { first: 900 },
  ability: {
    resolve() {
      throw new Error('a secret cause');
    },
  },
});
registerRole(bad);

const console_ = (c: Client): StewardView => {
  if (c.view?.kind !== 'steward') throw new Error('Not the steward');
  return c.view;
};

const SCRIPT = ['clockmaker', 'empath', 'oracle', 'poisoner', 'imp', 'butler', 'fool', 'sailor'].map(roleId);

async function autoTable(h: Harness, script: RoleId[] = SCRIPT) {
  const sw = await connect(h, 'Ann', { wantsStoryteller: true });
  const others: Client[] = [];
  for (const n of ['Bo', 'Cy', 'Di', 'Ed']) others.push(await connect(h, n));
  await sw.do({ type: 'choose_autoplay' });
  await sw.until((v) => v.kind === 'steward');
  await sw.do({ type: 'steward_open_setup' });
  await sw.do({ type: 'steward_script', roleIds: script });
  await sw.do({ type: 'steward_counts', counts: [3, 0, 1, 1] });
  await sw.do({ type: 'deal' });
  return { sw, others, all: [sw, ...others] };
}

async function submit(c: Client) {
  const view = await c.until((v) => (v.kind === 'steward' ? v.me : v).phase.stage === 'collecting');
  const me = view.kind === 'steward' ? view.me : view;
  if (me.kind !== 'player') throw new Error('Not playing');
  await c.do({ type: 'submit_night', actions: firstChoices(me) });
}

describe('an autoplay game over sockets', () => {
  it('closes the night by itself, and offers dawn when it is due', async () => {
    const h = await up();
    const { sw, others, all } = await autoTable(h);
    for (const c of all) await c.do({ type: 'seen_role' });
    await sw.until((v) => v.kind === 'steward' && v.seenRole?.seen === 5);
    await sw.do({ type: 'open_night' });
    for (const c of all) await submit(c);
    await sw.until((v) => v.kind === 'steward' && !!v.night?.closed);
    const log = () => h.app.games.get('default')?.state.phase;
    expect(log()).toMatchObject({ kind: 'night', stage: 'review' });
    // Phones show one screen, whatever stage the night is at.
    for (const c of others) expect(c.me.phase.stage).toBeNull();
    expect((await sw.send({ type: 'call_dawn' })).ok).toBe(false);
    wait(31);
    await sw.do({ type: 'call_dawn' });
    await sw.until((v) => v.phase.kind === 'day');
    expect(console_(sw).tell).toEqual(['Nobody died in the night.']);
    await sw.do({ type: 'nominate', nominator: others[0]!.id as PlayerId, nominee: others[1]!.id as PlayerId });
    await sw.do({ type: 'execute', playerId: null, yes: [] });
    await sw.do({ type: 'begin_night' });
    await others[0]!.until((v) => v.phase.kind === 'night' && v.phase.n === 1);
    for (const c of others) expect(c.raw.some((m) => /"kind":"(storyteller|steward)"/.test(m))).toBe(false);
    // The last the steward had of the Storyteller's view was the lobby's.
    expect(sw.raw.findLastIndex((m) => m.includes('"kind":"storyteller"'))).toBeLessThan(
      sw.raw.findIndex((m) => m.includes('"kind":"steward"')),
    );
  });

  it('sends the steward’s console again when time alone changes it', async () => {
    const h = await up();
    const { sw, all } = await autoTable(h);
    await sw.do({ type: 'open_night' });
    await sw.until((v) => v.kind === 'steward' && v.night?.names === null);
    // A second before the countdown is over, then nothing more is sent.
    wait(console_(sw).settings.countdownSeconds - 1);
    await sw.do({ type: 'seen_role' });
    expect(console_(sw).night?.names).toBeNull();
    const late = await sw.until((v) => v.kind === 'steward' && v.night?.names?.length === 5);
    expect(late.kind).toBe('steward');
    for (const c of all.slice(1)) await submit(c);
    await sw.do({ type: 'skip_player', playerId: sw.id as PlayerId });
    await sw.until((v) => v.kind === 'steward' && !!v.night?.closed);
  });

  it('keeps the log and the Storyteller’s place from everyone until the end', async () => {
    const h = await up();
    const { sw, others } = await autoTable(h);
    const get = (c: Client) => fetch(`${h.base}/api/g/default/export`, { headers: { cookie: c.cookie } });
    for (const c of [sw, others[0]!]) expect((await get(c)).status).toBe(403);
    const names = (await (await fetch(`${h.base}/api/g/default/names`)).json()) as { hasStoryteller: boolean };
    expect(names.hasStoryteller).toBe(true);
    expect((await others[0]!.send({ type: 'claim_storyteller' })).ok).toBe(false);
    await sw.do({ type: 'abandon' });
    expect((await get(sw)).status).toBe(200);
    expect((await get(others[0]!)).status).toBe(403);
    await sw.until((v) => v.kind === 'steward' && !!v.revealed);
    await sw.do({ type: 'steward_play_again' });
    expect((await get(sw)).status).toBe(403);
  });

  it('carries on after a restart', async () => {
    const config = testConfig();
    const first = await up(config);
    const { sw, all } = await autoTable(first);
    await sw.do({ type: 'open_night' });
    for (const c of all) await submit(c);
    await sw.until((v) => v.kind === 'steward' && !!v.night?.closed);
    for (const c of all) c.close();
    await first.app.close();
    opened.pop();
    const h = await up(config);
    const again = await dial(h, sw.cookie, sw.id);
    expect(console_(again).night?.closed).toBe(true);
    wait(31);
    await again.do({ type: 'call_dawn' });
    await again.until((v) => v.phase.kind === 'day');
  });

  it('takes a step that was due when it stopped', async () => {
    const config = testConfig();
    const first = await up(config);
    const { sw, all } = await autoTable(first);
    await sw.do({ type: 'open_night' });
    const game = first.app.games.get('default');
    if (!game) throw new Error('no game');
    // As if the server went down between the last player's submission and its own step.
    const wake = vi.spyOn(game, 'wake').mockImplementation(() => {});
    for (const c of all) await submit(c);
    expect(game.state.phase).toMatchObject({ stage: 'collecting' });
    wake.mockRestore();
    for (const c of all) c.close();
    await first.app.close();
    opened.pop();
    const h = await up(config);
    expect(h.app.games.get('default')?.state.phase).toMatchObject({ stage: 'review' });
  });

  it('says it could not finish the night, and never why', async () => {
    const h = await up();
    // Three Townsfolk, so the bad one is in play. The bluffs are Outsiders.
    const script = ['empath', 'poisoner', 'imp', 'butler', 'moonchild', 'golem', 'oracle'].map(roleId);
    const { sw, all } = await autoTable(h, [...script, bad.id]);
    await sw.do({ type: 'open_night' });
    for (const c of all) await submit(c);
    await sw.until((v) => v.kind === 'steward' && !!v.night?.stuck);
    expect(console_(sw).night).toMatchObject({ closed: false, notDone: 0 });
    await sw.do({ type: 'retry_night' });
    expect(console_(sw).night?.stuck).toBe(true);
    for (const c of all) expect(c.raw.join('')).not.toContain('secret cause');
    await sw.do({ type: 'abandon' });
    await sw.until((v) => v.phase.kind === 'ended');
  });

  it('tells the steward who is connected', async () => {
    const h = await up();
    const { sw, others } = await autoTable(h);
    const on = () => console_(sw).players.filter((p) => p.connected).length;
    expect(on()).toBe(5);
    others[0]!.close();
    await sw.until((v) => v.kind === 'steward' && v.players.filter((p) => p.connected).length === 4);
  });

  it('opens the night’s games to a steward who has pressed done', async () => {
    const h = await up();
    const { sw } = await autoTable(h);
    await sw.do({ type: 'open_night' });
    const game = h.app.games.get('default');
    const idle = () => (game as unknown as { idleAtNight(id: string): boolean }).idleAtNight(sw.id);
    expect(idle()).toBe(false);
    await submit(sw);
    expect(idle()).toBe(true);
  });
});
