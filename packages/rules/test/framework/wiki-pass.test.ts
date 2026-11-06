// One test per primitive the per-character pass added to docs/mechanics.md. Every character here is a throwaway.
import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { defineRole, registerRole, type RoleDef, type SetupRules } from '../../src';
import { scene } from '../scenario';

function fake<S>(def: Parameters<typeof defineRole<S>>[0]): RoleId {
  registerRole(defineRole<S>(def) as RoleDef);
  return def.id;
}

const pick = (title: string) => (ctx: { seated: PlayerId[] }) => ({
  title,
  prompt: 'Choose.',
  fields: [{ kind: 'player' as const, label: 'Player', options: ctx.seated }],
});

const KILLER = fake({
  id: roleId('w-killer'),
  name: 'Killer',
  type: 'demon',
  abilityText: 'Each night*, choose a player: they die.',
  night: { other: 600 },
  ability: {
    picker: pick('Killer'),
    resolve(ctx) {
      const t = ctx.choice[0] as PlayerId | undefined;
      if (t && !ctx.impaired) ctx.attemptKill(t, 'demon');
    },
  },
});

const stops = (id: string, slot: number) =>
  fake({
    id: roleId(id),
    name: id,
    type: 'townsfolk',
    abilityText: 'Each night*, choose a player: if they are the Killer, they do not kill tonight.',
    night: { other: slot },
    ability: {
      picker: pick(id),
      resolve: () => undefined,
      stopsWaking: (ctx, target) =>
        target.roleId === KILLER && target.holder.kind === 'player' && ctx.choice[0] === target.holder.id,
    },
  });
const STOPPER = stops('w-stopper', 500);
const TOO_LATE = stops('w-too-late', 700);

const COMPANION = fake({
  id: roleId('w-companion'),
  name: 'Companion',
  type: 'townsfolk',
  abilityText: 'Each night*, choose a player.',
  night: { other: 650 },
  ability: { picker: pick('Companion'), resolve: () => undefined },
});
const TWO_FACED = fake({
  id: roleId('w-two-faced'),
  name: 'Two Faced',
  type: 'demon',
  abilityText: 'Holds the Killer and the Companion.',
  ability: {
    setup(ctx) {
      ctx.grant(ctx.holder, KILLER);
      ctx.grant(ctx.holder, COMPANION);
    },
  },
});

const WATCHER = fake({
  id: roleId('w-watcher'),
  name: 'Watcher',
  type: 'townsfolk',
  abilityText: 'Each night, learn how many others woke.',
  night: { first: 900, other: 900 },
  ability: {
    resolve: (ctx) =>
      ctx.inform({ truth: [`${ctx.seated.filter((p) => p !== ctx.holder && ctx.wokeTonight(p)).length} woke`] }),
  },
});

const REGRETTER = fake({
  id: roleId('w-regretter'),
  name: 'Regretter',
  type: 'townsfolk',
  abilityText: 'If the Seat after you is drunk by the end of the night, you die.',
  night: { other: 100 },
  ability: {
    resolve: () => undefined,
    nightEnd(ctx) {
      const next = ctx.aliveNeighbours(ctx.holder)[1] as PlayerId;
      if (ctx.n > 0 && ctx.isImpaired(next)) ctx.attemptKill(ctx.holder, 'regret');
    },
  },
});
const LATE_DRUNK = fake({
  id: roleId('w-late-drunk'),
  name: 'Late Drunk',
  type: 'townsfolk',
  abilityText: 'Each night*, late in the order, the player before you is drunk until dusk.',
  night: { other: 950 },
  ability: {
    resolve: (ctx) => void ctx.addCondition(ctx.aliveNeighbours(ctx.holder)[0] as PlayerId, 'drunk', { until: 'dusk' }),
  },
});

const COUNTER = fake({
  id: roleId('w-counter'),
  name: 'Counter',
  type: 'townsfolk',
  abilityText: 'Each night, choose a player: learn their name.',
  night: { first: 800, other: 800 },
  ability: {
    picker: pick('Counter'),
    resolve: (ctx) => ctx.inform({ truth: [`You chose ${ctx.choice[0] ?? 'nobody'}`] }),
  },
});
const DOUBLER = fake({
  id: roleId('w-doubler'),
  name: 'Doubler',
  type: 'townsfolk',
  abilityText: 'The Counter acts twice.',
  ability: { wakesTwice: (_ctx, target) => target.roleId === COUNTER },
});

const TURNER = fake({
  id: roleId('w-turner'),
  name: 'Turner',
  type: 'townsfolk',
  abilityText: 'The first night, the player after you turns evil.',
  night: { first: 700 },
  ability: {
    resolve: (ctx) => void ctx.changeAlignment(ctx.aliveNeighbours(ctx.holder)[1] as PlayerId, 'evil', 'turned'),
  },
});
const GUARD = fake({
  id: roleId('w-guard'),
  name: 'Guard',
  type: 'fabled',
  abilityText: 'No player becomes evil.',
  ability: { guardsAlignment: (_ctx, change) => change.to === 'evil' },
});

const HEALTHY = fake({
  id: roleId('w-healthy'),
  name: 'Healthy',
  type: 'outsider',
  abilityText: 'You are sober and healthy.',
  ability: { shieldsFrom: (ctx, c) => c.target === ctx.holder },
});
const DEMON_PROOF = fake({
  id: roleId('w-demon-proof'),
  name: 'Demon Proof',
  type: 'townsfolk',
  abilityText: 'Nothing the Demon does poisons you.',
  ability: {
    shieldsFrom: (ctx, c) => c.target === ctx.holder && c.sourcePlayer !== null && ctx.isDemon(c.sourcePlayer),
  },
});
const POISON_DEMON = fake({
  id: roleId('w-poison-demon'),
  name: 'Poison Demon',
  type: 'demon',
  abilityText: 'Your neighbours are poisoned.',
  ability: {
    deriveConditions: (ctx) => ctx.aliveNeighbours(ctx.holder).map((target) => ({ type: 'poisoned', target })),
  },
});

const LIAR = fake({
  id: roleId('w-liar'),
  name: 'Liar',
  type: 'demon',
  abilityText: 'All information is replaced.',
  ability: { transformInfo: () => ['A lie'] },
});
const TRUTH = fake({
  id: roleId('w-truth'),
  name: 'Truth',
  type: 'fabled',
  abilityText: 'The player in seat a always hears the truth.',
  ability: { guaranteesTruth: (_ctx, player) => player === 'a' },
});

const REVERSER = fake({
  id: roleId('w-reverser'),
  name: 'Reverser',
  type: 'outsider',
  abilityText: 'Whoever wins, loses, even if you are dead.',
  ability: {
    changesWinner: (ctx, winner) => (ctx.isImpaired(ctx.holder) ? winner : winner === 'good' ? 'evil' : 'good'),
  },
});

const WEIGHT = fake({
  id: roleId('w-weight'),
  name: 'Weight',
  type: 'traveller',
  abilityText: 'The player in seat b votes as three.',
  ability: { adjustVote: (_ctx, v) => (v.voters?.includes('b' as PlayerId) ? (v.count ?? 0) + 2 : null) },
});
const EVIL_VOID = fake({
  id: roleId('w-evil-void'),
  name: 'Evil Void',
  type: 'demon',
  abilityText: 'If only evil players voted, the tally is zero.',
  ability: {
    adjustVote: (ctx, v) => (v.voters?.length && v.voters.every((p) => ctx.alignmentOf(p) === 'evil') ? 0 : null),
  },
});

const SWAPPER = fake({
  id: roleId('w-swapper'),
  name: 'Swapper',
  type: 'traveller',
  abilityText: 'Each day, two players swap seats.',
  ability: {
    dayActions: () => [{ action: 'swap', label: 'Swap', prompt: 'Swap two players.', fields: [] }],
    applyDayAction(ctx) {
      ctx.swapSeats('b' as PlayerId, 'd' as PlayerId);
      return { summary: 'Swapped.', effective: true };
    },
  },
});

const duplicates = (id: string, name: string, rule: NonNullable<SetupRules['duplicates']>) =>
  fake({ id: roleId(id), name, type: 'townsfolk', abilityText: 'Duplicates.', setupRules: { duplicates: rule } });
const MANY = duplicates('w-many', 'Many', 'self');
const POPE = duplicates('w-copies', 'Copies', 'good');

const HIDER = fake({
  id: roleId('w-hider'),
  name: 'Hider',
  type: 'loric',
  abilityText: 'Living players do not know their character.',
  ability: { hidesCharacter: (ctx, player) => ctx.isAlive(player) },
});

const UNDEAD = fake({
  id: roleId('w-undead'),
  name: 'Undead',
  type: 'demon',
  abilityText: 'The 1st time you die, you live but register as dead.',
  initialState: () => ({ died: false }),
  ability: {
    interceptKill(ctx, kill) {
      if (kill.target !== ctx.holder || ctx.state.died) return 'pass';
      ctx.setState({ died: true });
      return 'prevent';
    },
    appearsDead: (ctx) => ctx.state.died,
  },
});

const REGAIN = fake({
  id: roleId('w-regain'),
  name: 'Regain',
  type: 'traveller',
  abilityText: 'Each night*, choose a dead player: they regain their ability until dusk.',
  night: { other: 100 },
  ability: {
    picker: pick('Regain'),
    resolve(ctx) {
      const t = ctx.choice[0] as PlayerId | undefined;
      if (!t) return;
      ctx.keepAbilityWhenDead(t);
      ctx.setState({ chosen: t });
    },
    onDusk(ctx) {
      const { chosen } = ctx.state as { chosen?: PlayerId };
      if (chosen) ctx.keepAbilityWhenDead(chosen, false);
    },
  },
});

const LENT = fake({
  id: roleId('w-lent'),
  name: 'Lent',
  type: 'townsfolk',
  abilityText: 'Each night, learn a word.',
  night: { first: 850, other: 850 },
  ability: { resolve: (ctx) => ctx.inform({ truth: ['The word'], falseLines: ['Another word'] }) },
});
const LENDER = fake({
  id: roleId('w-lender'),
  name: 'Lender',
  type: 'minion',
  abilityText: 'The Demon has the Lent ability while you work.',
  ability: {
    setup(ctx) {
      const demon = ctx.seated.find(ctx.isDemon);
      if (demon) ctx.grant(demon, LENT, { whileSourceWorks: true });
    },
  },
});

const MISLEADER = fake({
  id: roleId('w-misleader'),
  name: 'Misleader',
  type: 'townsfolk',
  abilityText: 'The player in seat b registers as evil.',
  ability: {
    registersOther: (ctx, subject) =>
      subject === 'b'
        ? { character: ctx.character(subject) as RoleId, type: 'minion', alignment: 'evil', alive: true }
        : null,
  },
});
const CHECKER = fake({
  id: roleId('w-checker'),
  name: 'Checker',
  type: 'townsfolk',
  abilityText: 'Each night, learn the alignment of the player in seat b and of the player in seat c.',
  night: { first: 900 },
  ability: {
    resolve: (ctx) =>
      ctx.inform({
        truth: [ctx.registers('b' as PlayerId).alignment, ctx.registers('c' as PlayerId).alignment],
      }),
  },
});

const GIVER = fake({
  id: roleId('w-giver'),
  name: 'Giver',
  type: 'fabled',
  abilityText: 'At dusk, every dead player regains their vote token.',
  ability: {
    onDusk(ctx) {
      for (const p of ctx.seated) if (!ctx.isAlive(p)) ctx.restoreGhostVote(p);
    },
  },
});

const rest = { c: 't1', d: 't2', e: 't3' };

describe('per-character pass: waking', () => {
  const stopped = (o: { drunk?: boolean; role?: RoleId } = {}) => {
    const s = scene({ a: o.role ?? STOPPER, b: KILLER, ...rest })
      .start()
      .nextNight();
    if (o.drunk) s.g.st({ type: 'add_condition', target: 'a' as PlayerId, condition: 'drunk' });
    return s;
  };

  it('stopsWaking takes the ability off the wake list and out of the walk', () => {
    const s = stopped();
    expect(s.specs('b')).toHaveLength(1);
    s.submit({ b: ['c'] });
    s.submit({ a: ['b'] });
    expect(s.specs('b')).toHaveLength(0);
    s.review();
    expect(s.res.deaths).toEqual([]);
    expect(s.res.actors.some((x) => x.playerId === 'b')).toBe(false);
  });

  it('stopsWaking leaves the ability alone when it chose someone else', () => {
    const s = stopped()
      .submit({ a: ['c'], b: ['d'] })
      .review();
    expect(s.res.deaths).toEqual(['d']);
  });

  it('stopsWaking needs a working ability that acts earlier in the order', () => {
    const drunk = stopped({ drunk: true })
      .submit({ a: ['b'], b: ['d'] })
      .review();
    expect(drunk.res.deaths).toEqual(['d']);
    const late = stopped({ role: TOO_LATE })
      .submit({ a: ['b'], b: ['d'] })
      .review();
    expect(late.res.deaths).toEqual(['d']);
  });

  it('stopsWaking stops one ability: the holder still wakes for another', () => {
    const s = scene({ a: STOPPER, b: TWO_FACED, ...rest })
      .start()
      .nextNight();
    expect(s.specs('b').map((x) => x.roleId)).toEqual([KILLER, COMPANION]);
    s.submit({ a: ['b'] });
    expect(s.specs('b').map((x) => x.roleId)).toEqual([COMPANION]);
  });

  it('wokeTonight counts a wake for an ability, and not a stopped one', () => {
    const woke = scene({ a: WATCHER, b: KILLER, c: STOPPER, d: 't1', e: 't2' })
      .start()
      .nextNight()
      .submit({ c: ['d'], b: ['e'] })
      .review();
    expect(woke.truth('a')).toEqual(['2 woke']);
    const stoppedNight = scene({ a: WATCHER, b: KILLER, c: STOPPER, d: 't1', e: 't2' })
      .start()
      .nextNight()
      .submit({ c: ['b'] })
      .review();
    expect(stoppedNight.truth('a')).toEqual(['1 woke']);
  });

  it('nightEnd sees what happened after its own slot', () => {
    const s = scene({ a: REGRETTER, b: 't1', c: LATE_DRUNK, d: 'd1', e: 't2' }).start().nextNight().review();
    expect(s.res.deaths).toEqual(['a']);
  });

  it('wakesTwice acts a second time, asks again, and keeps the results apart', () => {
    const s = scene({ a: COUNTER, b: DOUBLER, c: 'd1', d: 't1', e: 't2' })
      .start()
      .nextNight()
      .submit({ a: ['c'] })
      .review();
    expect(s.truth('a')).toEqual(['You chose c']);
    expect(s.res.questions).toHaveLength(1);
    s.answer('a', ['d']);
    expect(s.truth('a')).toEqual(['You chose c', 'You chose d']);
    expect(new Set(s.res.results.map((r) => r.key)).size).toBe(2);
  });
});

describe('per-character pass: alignment and health', () => {
  it('guardsAlignment stops a change, and the caller is told', () => {
    const open = scene({ a: TURNER, b: 't1', c: 'd1', d: 't2', e: 't3' }).start().dawn();
    expect(open.alignment('b')).toBe('evil');
    const held = scene({ a: TURNER, b: 't1', c: 'd1', d: 't2', e: 't3' }, { extra: [GUARD] });
    held.g.st({ type: 'set_storyteller_characters', roleIds: [GUARD] });
    held.start().dawn();
    expect(held.alignment('b')).toBe('good');
  });

  it('shieldsFrom keeps a holder healthy, even while poisoned', () => {
    const s = scene({ a: HEALTHY, b: 't1', c: 'd1', d: 't2', e: 't3' }).start();
    for (const target of ['a', 'b'] as PlayerId[]) s.g.st({ type: 'add_condition', target, condition: 'poisoned' });
    expect(s.impaired('a')).toBe(false);
    expect(s.impaired('b')).toBe(true);
  });

  it('shieldsFrom can name its source', () => {
    const s = scene({ a: DEMON_PROOF, b: POISON_DEMON, c: 't1', d: 't2', e: 't3' }).start();
    expect(s.impaired('a')).toBe(false);
    expect(s.impaired('c')).toBe(true);
    s.g.st({ type: 'add_condition', target: 'a' as PlayerId, condition: 'drunk' });
    expect(s.impaired('a')).toBe(true);
  });

  it('guaranteesTruth keeps transformInfo off one player', () => {
    const cast = { a: COUNTER, b: WATCHER, c: LIAR, d: 't1', e: 't2' };
    const plain = scene(cast)
      .start()
      .submit({ a: ['d'] })
      .review();
    expect(plain.final('a')).toEqual(['A lie']);
    const kept = scene(cast, { extra: [TRUTH] });
    kept.g.st({ type: 'set_storyteller_characters', roleIds: [TRUTH] });
    kept
      .start()
      .submit({ a: ['d'] })
      .review();
    expect(kept.final('a')).toEqual(['You chose d']);
    expect(kept.final('b')).toEqual(['A lie']);
  });

  it('whileSourceWorks: a granted ability fails while its giver does, and comes back', () => {
    const s = scene({ a: 'd1', b: LENDER, c: 't1', d: 't2', e: 't3' }, { extra: [LENT] }).start();
    expect(s.final('a')).toEqual(['The word']);
    s.g.st({ type: 'add_condition', target: 'b' as PlayerId, condition: 'poisoned' });
    expect(s.final('a')).toEqual(['Another word']);
    s.nextNight();
    expect(s.final('a')).toEqual(['The word']);
    s.g.st({ type: 'mark_alive', playerId: 'b' as PlayerId, alive: false });
    expect(s.final('a')).toEqual(['Another word']);
  });

  it('registersOther: one ability makes another player register falsely', () => {
    const s = scene({ a: CHECKER, b: 't1', c: 't2', d: MISLEADER, e: 'd1' }).start().review();
    expect(s.truth('a')).toEqual(['evil', 'good']);
  });
});

describe('per-character pass: the day', () => {
  it('adjustVote reweighs a recorded vote, and later hooks see the change', () => {
    const s = scene({ a: WEIGHT, b: 't1', c: EVIL_VOID, d: 't2', e: 't3' }).start().dawn();
    const vote = (voters: string[]) => {
      s.g.st({ type: 'record_vote', nominee: 'd' as PlayerId, count: voters.length, voters: voters as PlayerId[] });
      const last = s.state.events.at(-1);
      return last?.kind === 'vote' ? last.count : null;
    };
    expect(vote(['a', 'd'])).toBe(2);
    expect(vote(['b', 'd'])).toBe(4);
    s.g.st({ type: 'record_vote', nominee: 'd' as PlayerId, count: 3, voters: null });
    const noNames = s.state.events.at(-1);
    expect(noNames?.kind === 'vote' && noNames.count).toBe(3);
  });

  it('adjustVote: a tally can fall to zero', () => {
    const s = scene({ a: 't1', b: 't2', c: EVIL_VOID, d: 'm1', e: 't3' }).start().dawn();
    s.g.st({ type: 'record_vote', nominee: 'a' as PlayerId, count: 2, voters: ['c', 'd'] as PlayerId[] });
    const last = s.state.events.at(-1);
    expect(last?.kind === 'vote' && last.count).toBe(0);
  });

  it('the Storyteller can be the nominator', () => {
    const s = scene({ a: 'virgin', b: 't1', c: 'd1', d: 't2', e: 't3' }).start().dawn();
    s.g.st({ type: 'record_nomination', nominator: null, nominee: 'a' as PlayerId });
    expect(s.state.events.some((e) => e.kind === 'nomination' && e.nominator === null)).toBe(true);
    expect(s.state.prompts).toEqual([]);
  });

  it('swapSeats moves players, and neighbours follow', () => {
    const s = scene({ a: SWAPPER, b: 't1', c: 'd1', d: 't2', e: 't3' }).start().dawn();
    s.act(SWAPPER, 'swap', []);
    expect(s.state.seats.map((x) => x.playerId)).toEqual(['a', 'd', 'c', 'b', 'e']);
    expect(s.state.publishedSeating).toEqual(['a', 'd', 'c', 'b', 'e']);
  });

  it('onDusk runs before the night, and can end what a night gave', () => {
    const s = scene({ a: REGAIN, b: COUNTER, c: 'd1', d: 't1', e: 't2' }).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'b' as PlayerId, alive: false });
    s.dusk()
      .submit({ a: ['b'] })
      .review();
    const held = () => Object.values(s.state.abilities).find((x) => x.roleId === COUNTER);
    s.dawn();
    expect(held()?.survivesDeath).toBe(true);
    s.dusk();
    expect(held()?.survivesDeath).toBe(false);
  });

  it('restoreGhostVote gives a dead player their token back', () => {
    const s = scene({ a: 't1', b: 't2', c: 'd1', d: 't3', e: 't4' }, { extra: [GIVER] });
    s.g.st({ type: 'set_storyteller_characters', roleIds: [GIVER] });
    s.start().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'a' as PlayerId, alive: false });
    s.g.as('a' as PlayerId, { type: 'use_ghost_vote' });
    expect(s.state.players['a' as PlayerId]?.life.ghostVoteUsed).toBe(true);
    s.dusk();
    expect(s.state.players['a' as PlayerId]?.life.ghostVoteUsed).toBe(false);
  });

  it('changesWinner reverses every end, even from a dead holder, unless impaired', () => {
    const s = scene({ a: REVERSER, b: 't1', c: 'd1', d: 't2', e: 't3' }).start().dawn();
    s.g.st({ type: 'mark_alive', playerId: 'a' as PlayerId, alive: false });
    s.execute('c');
    expect(s.winners()).toEqual(['evil']);
    const drunk = scene({ a: REVERSER, b: 't1', c: 'd1', d: 't2', e: 't3' }).start().dawn();
    drunk.g.st({ type: 'add_condition', target: 'a' as PlayerId, condition: 'drunk' });
    drunk.execute('c');
    expect(drunk.winners()).toEqual(['good']);
  });
});

describe('per-character pass: setup and views', () => {
  it('duplicates: a role may repeat when a rule on the script allows it', () => {
    const s = scene({ a: 't1', b: 't2', c: 'd1', d: MANY, e: POPE }, { extra: [] });
    const assign = (playerId: string, role: string) => ({
      type: 'assign_character' as const,
      playerId: playerId as PlayerId,
      roleId: role as RoleId,
    });
    s.g.st(assign('a', MANY));
    expect(s.character('a')).toBe(MANY);
    s.g.st(assign('b', 't-town-3'));
    expect(s.character('b')).toBe('t-town-3');
    expect(s.g.rejected('st' as PlayerId, assign('d', 't-demon-1'))).toMatch(/already assigned/);
  });

  it('duplicates: each holder acts for themselves', () => {
    const s = scene({ a: SELF_COPY, b: SELF_COPY, c: 'd1', d: 't1', e: 't2' }).start().submit({}).review();
    expect(s.truth('a')).toEqual(['Mine']);
    expect(s.truth('b')).toEqual(['Mine']);
  });

  it('hidesCharacter shows a player nothing until the hook lets it go', () => {
    const s = scene({ a: 't1', b: 't2', c: 'd1', d: 't3', e: 't4' }, { extra: [HIDER] });
    s.g.st({ type: 'set_storyteller_characters', roleIds: [HIDER] });
    s.start().dawn();
    expect(s.g.view('a' as PlayerId).me.role).toBeNull();
    s.g.st({ type: 'mark_alive', playerId: 'a' as PlayerId, alive: false });
    expect(s.g.view('a' as PlayerId).me.role).not.toBeNull();
  });

  it('appearsDead tells the table a living player died', () => {
    const s = scene({ a: UNDEAD, b: KILLER, c: 't1', d: 't2', e: 't3' }).start().nextNight();
    s.submit({ b: ['a'] }).dawn();
    expect(s.alive('a')).toBe(true);
    expect(s.state.publicDead).toEqual(['a']);
  });
});

const SELF_COPY = fake({
  id: roleId('w-self-copy'),
  name: 'Self Copy',
  type: 'townsfolk',
  abilityText: 'Each night, learn a word.',
  setupRules: { duplicates: 'self' },
  night: { first: 870 },
  ability: { resolve: (ctx) => ctx.inform({ truth: ['Mine'] }) },
});
