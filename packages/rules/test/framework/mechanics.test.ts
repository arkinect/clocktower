// One test per row of docs/mechanics.md. Every character here is a throwaway: none of them is in the game.
import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { describe, expect, it } from 'vitest';
import { defineRole, registerRole, type RoleDef } from '../../src';
import { scene } from '../scenario';
import { TRAVELLER } from '../helpers/plain';

function fake<S>(def: Parameters<typeof defineRole<S>>[0]): RoleId {
  registerRole(defineRole<S>(def) as RoleDef);
  return def.id;
}

const self = (ctx: { holder: PlayerId }) => ctx.holder;

const CHANGER = fake({
  id: roleId('x-changer'),
  name: 'Changer',
  type: 'townsfolk',
  abilityText: 'Each night, the player after you becomes a Mutant.',
  night: { first: 1000, other: 1000 },
  ability: {
    resolve(ctx) {
      const next = ctx.aliveNeighbours(ctx.holder)[1] as PlayerId;
      ctx.changeCharacter(next, roleId('x-mutant'), { reason: 'changed', alignment: 'natural', noActTonight: true });
    },
  },
});
fake({ id: roleId('x-mutant'), name: 'Mutant', type: 'minion', abilityText: 'A character others become.' });

const TURNCOAT = fake({
  id: roleId('x-turncoat'),
  name: 'Turncoat',
  type: 'townsfolk',
  abilityText: 'The player after you turns evil.',
  night: { first: 1001 },
  ability: {
    resolve: (ctx) => ctx.changeAlignment(ctx.aliveNeighbours(ctx.holder)[1] as PlayerId, 'evil', 'turned'),
  },
});

const SEER = fake({
  id: roleId('x-seer'),
  name: 'Seer',
  type: 'townsfolk',
  abilityText: 'Each night, learn your own ability name.',
  night: { first: 1100, other: 1100 },
  ability: {
    resolve: (ctx) =>
      ctx.inform({ truth: [ctx.believed ? 'I only think so' : 'I really can'], falseLines: ['Something false'] }),
  },
});

const GIVER = fake({
  id: roleId('x-giver'),
  name: 'Giver',
  type: 'townsfolk',
  abilityText: 'Grants the Seer, hidden under this name.',
  night: { first: 1002 },
  ability: {
    resolve(ctx) {
      ctx.grant(ctx.holder, SEER, { shownAs: ctx.ability.roleId, startInfo: true });
    },
  },
});

const IMAGINER = fake({
  id: roleId('x-imaginer'),
  name: 'Imaginer',
  type: 'townsfolk',
  abilityText: 'Believes in the Seer.',
  night: { first: 1003 },
  ability: {
    resolve(ctx) {
      ctx.grant(ctx.holder, SEER, { perceivedOnly: true, startInfo: true });
    },
  },
});

const MOVER = fake({
  id: roleId('x-mover'),
  name: 'Mover',
  type: 'townsfolk',
  abilityText: 'Holds a token that moves on each night.',
  night: { first: 1004, other: 1004 },
  flags: { holderIsDemon: true },
  ability: {
    resolve: (ctx) => ctx.move(ctx.ability.id, ctx.aliveNeighbours(ctx.holder)[1] as PlayerId),
  },
});

const FABLED = fake<{ ran: number }>({
  id: roleId('x-fabled'),
  name: 'Sage',
  type: 'fabled',
  abilityText: 'Held by the Storyteller; acts each night.',
  night: { first: 900, other: 900 },
  initialState: () => ({ ran: 0 }),
  ability: { resolve: (ctx) => ctx.setState({ ran: ctx.state.ran + 1 }) },
});

const LORIC = fake({ id: roleId('x-loric'), name: 'Lore', type: 'loric', abilityText: 'Fixed at setup.' });

const EVIL_FACE = fake({
  id: roleId('x-evil-face'),
  name: 'Evil Face',
  type: 'outsider',
  abilityText: 'Registers as an evil Imposter.',
  ability: {
    registersAs: (ctx) => ({
      character: roleId('x-mutant'),
      type: 'minion',
      alignment: 'evil',
      alive: !ctx.isAlive(ctx.holder),
    }),
  },
});

const ASKER = fake({
  id: roleId('x-asker'),
  name: 'Asker',
  type: 'townsfolk',
  abilityText: 'Learns what the player after you registers as.',
  night: { first: 1200, other: 1200 },
  ability: {
    resolve(ctx) {
      const t = ctx.aliveNeighbours(ctx.holder)[1] as PlayerId;
      const r = ctx.registers(t, 'character');
      ctx.inform({ truth: [`${r.character} ${r.type} ${r.alignment} ${r.alive ? 'alive' : 'dead'}`] });
    },
  },
});

const ALWAYS_ADD = fake({
  id: roleId('x-outsiders'),
  name: 'Crowder',
  type: 'minion',
  abilityText: 'Three extra Outsiders, no Demon, sits next to a Minion.',
  setupRules: {
    neighbours: 'minion',
    notBluffable: true,
    counts(c) {
      c[1] += 3;
      c[0] -= 2;
      c[3] -= 1;
    },
  },
});

const BAG = fake({
  id: roleId('x-bag'),
  name: 'Bagged',
  type: 'outsider',
  abilityText: 'Draws another token.',
  believes: { allowed: (r) => r.type === 'demon', label: 'a Demon' },
});

const HIDER = fake({
  id: roleId('x-hider'),
  name: 'Hider',
  type: 'minion',
  abilityText: 'Is left out of the Minion info, and the Demon hears a word.',
  ability: {
    modifyEvilInfo(ctx, info) {
      info.minions = info.minions.filter((x) => x !== ctx.holder);
      info.demonLines.push('A secret word.');
    },
  },
});

const seen: string[] = [];
const WATCHER = fake({
  id: roleId('x-watcher'),
  name: 'Watcher',
  type: 'townsfolk',
  abilityText: 'Sees day events.',
  ability: {
    onDayEvent: (_ctx, e) => void seen.push(e.kind),
    checkGameEnd(ctx) {
      if (ctx.n >= 1 && ctx.seated.filter((id) => !ctx.isAlive(id)).length >= 2) {
        ctx.suggestGameEnd('watcher', 'evil', 'Two have died.');
      }
    },
  },
});

const LIAR = fake({
  id: roleId('x-liar'),
  name: 'Liar',
  type: 'demon',
  abilityText: 'All information is false.',
  ability: { transformInfo: (_ctx, info) => (info.truth.length ? ['Twisted', ...info.truth] : null) },
});

const SPY = fake({
  id: roleId('x-spy'),
  name: 'Peeker',
  type: 'minion',
  abilityText: 'Sees the Grimoire.',
  ability: {
    visibility: (ctx) => [
      { title: 'Grimoire', lines: ctx.seated.map((id) => `${ctx.name(id)}: ${ctx.roleName(ctx.character(id))}`) },
    ],
  },
});

const order: string[] = [];
const guard = (id: string, priority: number, result: 'pass' | 'prevent' | 'redirect') =>
  fake({
    id: roleId(id),
    name: id,
    type: 'townsfolk',
    abilityText: 'Guards a kill.',
    flags: { interceptPriority: priority },
    ability: {
      interceptKill(ctx, kill) {
        order.push(id);
        if (kill.target !== ctx.holder) return 'pass';
        if (result !== 'redirect') return result;
        return kill.redirected ? 'pass' : { redirect: ctx.aliveNeighbours(ctx.holder)[1] as PlayerId };
      },
    },
  });
const GUARD_PASS = guard('x-guard-pass', 80, 'pass');
const GUARD_STOP = guard('x-guard-stop', 40, 'prevent');
const GUARD_MOVE = guard('x-guard-move', 45, 'redirect');

const KILLER = fake({
  id: roleId('x-killer'),
  name: 'Killer',
  type: 'demon',
  abilityText: 'Each night, choose a player: they die.',
  night: { other: 500 },
  ability: {
    picker: (ctx) => ({
      title: 'Killer',
      prompt: 'Choose.',
      fields: [{ kind: 'player', label: 'Player', options: ctx.seated }],
    }),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (t) ctx.attemptKill(t, 'demon_attack');
    },
  },
});

const deaths: string[] = [];
const MOURNER = fake({
  id: roleId('x-mourner'),
  name: 'Mourner',
  type: 'townsfolk',
  abilityText: 'Hears about every death.',
  flags: { worksWhileDead: true },
  ability: {
    onDeath: (ctx, d) => void deaths.push(`${ctx.name(d.playerId)}:${d.cause}`),
  },
});

const AURA = fake({
  id: roleId('x-aura'),
  name: 'Aura',
  type: 'demon',
  abilityText: 'The player after you is poisoned.',
  ability: {
    deriveConditions: (ctx) => [{ target: ctx.aliveNeighbours(ctx.holder)[1] as PlayerId, type: 'poisoned' }],
  },
});
// Two characters that each poison the other, while the other works: the mutual dependency.
const LOCK_A = fake({
  id: roleId('x-lock-a'),
  name: 'Lock A',
  type: 'townsfolk',
  abilityText: 'The other Lock is poisoned.',
  ability: {
    deriveConditions: (ctx) => ctx.playersWith(roleId('x-lock-b')).map((target) => ({ target, type: 'poisoned' })),
  },
});
const LOCK_B = fake({
  id: roleId('x-lock-b'),
  name: 'Lock B',
  type: 'townsfolk',
  abilityText: 'The other Lock is poisoned.',
  ability: { deriveConditions: (ctx) => ctx.playersWith(LOCK_A).map((target) => ({ target, type: 'poisoned' })) },
});

const QUIZ = fake({
  id: roleId('x-quiz'),
  name: 'Quizzer',
  type: 'townsfolk',
  abilityText: 'Asks the player after you a question.',
  night: { first: 1300 },
  ability: {
    resolve(ctx) {
      const t = ctx.aliveNeighbours(ctx.holder)[1] as PlayerId;
      const answer = ctx.ask({
        to: t,
        asksOther: true,
        spec: {
          title: 'Quizzer',
          prompt: 'Yes or no?',
          fields: [{ kind: 'option', label: 'Answer', options: ['y', 'n'] }],
        },
      });
      ctx.inform({ truth: [answer ? `They said ${answer[0]}` : 'No answer yet'] });
    },
  },
});

const BROKEN = fake({
  id: roleId('x-broken'),
  name: 'Broken',
  type: 'townsfolk',
  abilityText: 'Malfunctions every night.',
  night: { first: 150 },
  ability: { resolve: (ctx) => ctx.malfunction(ctx.holder, 'test', 'Broke') },
});

const CHOOSER = fake({
  id: roleId('x-chooser'),
  name: 'Chooser',
  type: 'townsfolk',
  abilityText: 'Chooses a player.',
  night: { first: 1500 },
  ability: {
    picker: (ctx) => ({
      title: 'Chooser',
      prompt: 'Choose.',
      fields: [{ kind: 'player', label: 'Player', options: ctx.seated }],
    }),
    resolve: () => undefined,
  },
});
const CHOSEN = fake({
  id: roleId('x-chosen'),
  name: 'Chosen',
  type: 'outsider',
  abilityText: 'Hears who chose them.',
  ability: {
    onChosen: (ctx, by) => ctx.notify(self(ctx), 'Chosen', [`${ctx.name(by.player)} chose you`]),
  },
});

const EARLY = fake({
  id: roleId('x-early'),
  name: 'Early',
  type: 'townsfolk',
  abilityText: 'Asks a coin, then a die.',
  night: { first: 1600 },
  ability: {
    resolve(ctx) {
      const options = [
        { id: 'a', label: 'a' },
        { id: 'b', label: 'b' },
      ];
      const first = ctx.decide<string>({
        key: { kind: 'first' },
        title: 'First',
        description: '',
        options,
        default: 'a',
      });
      if (first === 'a')
        ctx.decide<string>({ key: { kind: 'only_a' }, title: 'A', description: '', options, default: 'a' });
      const later = ctx.decide<string>({
        key: { kind: 'later' },
        title: 'Later',
        description: '',
        options,
        default: 'a',
      });
      ctx.inform({ truth: [`${first} ${later}`] });
    },
  },
});

const scriptOf = (...ids: RoleId[]) => ({ extra: ids as string[] });
const five = { b: 't1', c: 'd1', d: 't2', e: 't3' };

describe('mechanics', () => {
  it('character change on any player', () => {
    const s = scene({ a: CHANGER, ...five }).start();
    s.dawn();
    expect(s.character('b')).toBe('x-mutant');
    expect(s.alignment('b')).toBe('evil');
    expect(s.g.player('b' as PlayerId).history.some((h) => h.kind === 'character')).toBe(true);
    expect(Object.values(s.state.abilities).some((x) => x.roleId === 'x-mutant' && x.activeUntil !== 'removed')).toBe(
      true,
    );
  });

  it('alignment change', () => {
    const s = scene({ a: TURNCOAT, ...five })
      .start()
      .dawn();
    expect(s.alignment('b')).toBe('evil');
    expect(s.character('b')).toBe('t-town-1');
  });

  it('gained, hidden and moving abilities', () => {
    const s = scene({ a: GIVER, ...five }).start();
    const row = s.res.results.find((r) => r.playerId === 'a' && r.roleId === SEER);
    expect(row?.truth).toEqual(['I really can']);
    expect(row?.title).toContain('Giver');
    expect(row?.title).not.toContain('Seer');
    const m = scene({ a: MOVER, ...five, c: 't4' })
      .start()
      .dawn();
    expect(m.state.abilities[m.ability(MOVER)]?.holder).toEqual({ kind: 'player', id: 'b' });
    expect(m.g.grimoire().players.find((p) => p.id === 'b')?.isDemon).toBe(true);
  });

  it('believed-only ability', () => {
    const s = scene({ a: IMAGINER, ...five }).start();
    expect(s.truth('a')).toEqual(['I only think so']);
  });

  it('abilities with no player holder', () => {
    const s = scene({ a: 't4', ...five }, scriptOf(FABLED, LORIC));
    s.g.st({ type: 'set_storyteller_characters', roleIds: [FABLED, LORIC] });
    s.start().nextNight().dawn();
    expect((s.state.abilities[s.ability(FABLED)]?.state as { ran: number }).ran).toBe(2);
    const error = s.g.rejected('st' as PlayerId, { type: 'set_storyteller_characters', roleIds: [FABLED] });
    expect(error).toBe('Loric are fixed at setup.');
    s.g.st({ type: 'set_storyteller_characters', roleIds: [LORIC] });
    expect(s.state.storytellerCharacters).toEqual([LORIC]);
  });

  it('Travellers', () => {
    const s = scene({ a: 't4', ...five }, { extra: [TRAVELLER[0] as string] })
      .start()
      .dawn();
    s.g.as(null, { type: 'join', id: 'vi' as PlayerId, name: 'Vi', rolePreference: 'none', wantsStoryteller: false });
    s.g.st({ type: 'add_traveller', playerId: 'vi' as PlayerId, roleId: TRAVELLER[0] as RoleId, alignment: 'evil' });
    expect(s.alignment('vi')).toBe('evil');
    expect(s.inbox('vi').join(' ')).toContain('The Demon is: c.');
    expect(s.g.view('a' as PlayerId).players.find((p) => p.id === 'vi')?.publicRole).toBe(TRAVELLER[0]);
    s.execute('a').g.st({ type: 'mark_alive', playerId: 'b' as PlayerId, alive: false });
    s.g.st({ type: 'mark_alive', playerId: 'd' as PlayerId, alive: false });
    s.g.st({ type: 'mark_alive', playerId: 'e' as PlayerId, alive: false });
    // The Demon and a Traveller left: two residents would be three; the Traveller doesn't count.
    expect(s.state.gameEnd.map((q) => q.key)).toContain('two_left');
    s.g.st({ type: 'exile_traveller', playerId: 'vi' as PlayerId });
    expect(s.g.view('a' as PlayerId).players.find((p) => p.id === 'vi')?.exiled).toBe(true);
    expect(s.alive('vi')).toBe(false);
  });

  it('full registration', () => {
    const s = scene({ a: ASKER, b: EVIL_FACE, c: 'd1', d: 't2', e: 't3' }).start();
    expect(s.truth('a')).toEqual(['x-mutant minion evil dead']);
  });

  it('setup rules as data: counts, Demon count, seating, bluffs, bag token', () => {
    const s = scene({ a: ALWAYS_ADD, b: 't1', c: 'm1', d: 't3', e: 't4' });
    expect(s.g.grimoire().setup.counts.target).toEqual([1, 3, 1, 0]);
    expect(
      s.g
        .grimoire()
        .setup.warnings.concat(
          s.g
            .grimoire()
            .setup.checklist.filter((c) => !c.done)
            .map((c) => c.label),
        )
        .join(' '),
    ).toMatch(/neighbour|next to/i);
    expect(s.g.grimoire().setup.bluffCandidates).not.toContain(ALWAYS_ADD);
    const b = scene({ a: BAG, ...five }, { believed: { a: 'imp' } }).start();
    expect(b.character('a')).toBe(BAG);
    expect(b.g.view('a' as PlayerId).me.role?.name).toBe('Imp');
  });

  it('evil information: the policy and modifyEvilInfo', () => {
    const cast = { a: 'd1', b: 'm1', c: 'm2', d: HIDER, e: 't1', f: 't2', g: 't3' };
    const house = scene(cast).start();
    expect(house.inbox('b').join(' ')).toContain('c');
    expect(house.inbox('b').join(' ')).not.toContain('The Demon is');
    expect(house.inbox('d')).toEqual([]);
    expect(house.inbox('a')).toContain('A secret word.');
    const official = scene(cast, { evilInfoPolicy: 'official' }).start();
    expect(official.inbox('b').join(' ')).toContain('a');
    expect(official.g.view('b' as PlayerId).me.messages.length).toBeGreaterThanOrEqual(
      house.g.view('b' as PlayerId).me.messages.length,
    );
  });

  it('day events with hooks', () => {
    seen.length = 0;
    const s = scene({ a: WATCHER, ...five }, { extra: [TRAVELLER[0] as string] })
      .start()
      .dawn();
    s.nominate('b', 'c');
    s.g.st({ type: 'record_vote', nominee: 'c' as PlayerId, count: 2, voters: null });
    s.g.st({ type: 'record_statement', playerId: 'b' as PlayerId, text: 'Hello' });
    s.execute('d');
    s.g.as(null, { type: 'join', id: 'vi' as PlayerId, name: 'Vi', rolePreference: 'none', wantsStoryteller: false });
    s.g.st({ type: 'add_traveller', playerId: 'vi' as PlayerId, roleId: TRAVELLER[0] as RoleId, alignment: 'good' });
    s.g.st({ type: 'exile_traveller', playerId: 'vi' as PlayerId });
    expect(seen).toEqual(['nomination', 'vote', 'statement', 'execution', 'exile']);
  });

  it('game end: suggested, and the Storyteller confirms', () => {
    const s = scene({ a: WATCHER, ...five })
      .start()
      .dawn();
    s.execute('b');
    expect(s.state.gameEnd).toEqual([]);
    s.g.st({ type: 'mark_alive', playerId: 'd' as PlayerId, alive: false });
    s.execute('e');
    const q = s.state.gameEnd.find((x) => x.key === 'watcher');
    expect(q?.winner).toBe('evil');
    expect(s.state.phase.kind).toBe('day');
    s.g.st({ type: 'confirm_game_end', key: q?.key as string });
    expect(s.state.phase.kind).toBe('ended');
  });

  it('information transform', () => {
    const s = scene({ a: SEER, b: 't1', c: LIAR, d: 't2', e: 't3' }).start();
    const row = s.row('a');
    expect(row.truth).toEqual(['I really can']);
    expect(row.transformed).toEqual(['Twisted', 'I really can']);
    expect(row.final).toEqual(['Twisted', 'I really can']);
  });

  it('visibility grants', () => {
    const s = scene({ a: SPY, ...five }).start();
    expect(s.g.view('a' as PlayerId).me.grants[0]?.lines[1]).toBe('b: Town 1');
    expect(s.g.view('b' as PlayerId).me.grants).toEqual([]);
  });

  it('madness', () => {
    const s = scene({ a: 't4', ...five })
      .start()
      .dawn();
    s.g.st({ type: 'add_condition', target: 'a' as PlayerId, condition: 'mad' });
    expect(s.impaired('a')).toBe(false);
    s.g.st({ type: 'record_broke_madness', playerId: 'a' as PlayerId, ruling: 'Executed for it' });
    expect(s.state.events.at(-1)).toMatchObject({ kind: 'broke_madness', ruling: 'Executed for it' });
    expect(s.g.grimoire().story.some((e) => JSON.stringify(e).includes('broke madness'))).toBe(true);
  });

  it('kill interception by priority, and redirect', () => {
    order.length = 0;
    const s = scene({ a: KILLER, b: GUARD_PASS, c: GUARD_STOP, d: 't1', e: 't2' }).start().nextNight();
    s.submit({ a: ['c'] }).dawn();
    expect(s.alive('c')).toBe(true);
    expect(order[0]).toBe('x-guard-stop');
    expect(order).not.toContain('x-guard-pass');
  });

  it('a redirect re-enters the pipeline at the new target', () => {
    const s = scene({ a: KILLER, b: GUARD_MOVE, c: 't1', d: 't2', e: 't3' }).start().nextNight();
    s.submit({ a: ['b'] }).dawn();
    expect(s.alive('b')).toBe(true);
    expect(s.alive('c')).toBe(false);
  });

  it('death and execution triggers', () => {
    deaths.length = 0;
    const s = scene({ a: KILLER, b: MOURNER, c: 't1', d: 't2', e: 't3' }).start().nextNight();
    s.submit({ a: ['c'] })
      .dawn()
      .execute('d');
    expect(deaths).toContain('c:demon_attack');
    expect(deaths).toContain('d:execution');
    expect(new Set(deaths).size).toBe(2);
  });

  it('derived conditions', () => {
    const s = scene({ a: AURA, b: 't1', c: 't2', d: 't3', e: 't4' }).start().dawn();
    expect(s.impaired('b')).toBe(true);
    s.execute('b');
    expect(s.impaired('c')).toBe(true);
    s.execute('a');
    expect(s.impaired('c')).toBe(false);
  });

  it('staged impairment gives one answer for a mutual dependency', () => {
    const s = scene({ a: LOCK_A, b: LOCK_B, c: 'd1', d: 't2', e: 't3' }).start();
    // Stage 3 is judged against stage 1, so neither silences the other and both are poisoned, whatever the seats.
    expect([s.impaired('a'), s.impaired('b')]).toEqual([true, true]);
    const swapped = scene({ a: LOCK_B, b: LOCK_A, c: 'd1', d: 't2', e: 't3' }).start();
    expect([swapped.impaired('a'), swapped.impaired('b')]).toEqual([true, true]);
  });

  it('questions to other players', () => {
    const s = scene({ a: QUIZ, ...five })
      .start()
      .review();
    expect(s.res.questions.map((q) => q.playerId)).toEqual(['b']);
    expect(s.truth('a')).toEqual(['No answer yet']);
    expect(s.g.rejected('st' as PlayerId, { type: 'publish_dawn', force: false })).toMatch(/question|answer|waiting/i);
    expect(s.g.view('b' as PlayerId).me.questions).toHaveLength(1);
    s.answer('b', ['y']);
    expect(s.truth('a')).toEqual(['They said y']);
    s.g.st({ type: 'publish_dawn', force: false });
    expect(s.state.phase.kind).toBe('day');
  });

  it('malfunction log', () => {
    const s = scene({ a: BROKEN, b: 'mathematician', c: 'd1', d: 't2', e: 't3' }).start().review();
    expect(s.res.malfunctions.map((m) => `${m.playerId}:${m.detail}`)).toEqual(['a:Broke']);
    expect(s.truth('b')).toEqual(["1 player's ability worked abnormally."]);
    s.g.st({ type: 'adjust_malfunctions', add: ['d' as PlayerId, 'e' as PlayerId], remove: [] });
    expect(s.truth('b')).toEqual(["3 players' abilities worked abnormally."]);
  });

  it('night order is by position, whatever the seats', () => {
    const names: string[] = [];
    const log = (id: string, position: number) =>
      fake({
        id: roleId(id),
        name: id,
        type: 'townsfolk',
        abilityText: 'Logs its turn.',
        night: { first: position },
        ability: { resolve: () => void names.push(id) },
      });
    const late = log('x-late', 5000);
    const early = log('x-early-slot', 4000);
    const between = log('x-between', 4500);
    resolveFor(scene({ a: late, b: between, c: 'd1', d: early, e: 't1' }).start());
    expect(names.slice(0, 3)).toEqual(['x-early-slot', 'x-between', 'x-late']);
  });

  it('being chosen by an ability', () => {
    const s = scene({ a: CHOOSER, b: CHOSEN, c: 'd1', d: 't1', e: 't2' })
      .start()
      .submit({ a: ['b'] })
      .dawn();
    expect(s.inbox('b')).toContain('a chose you');
  });
});

describe('decisions', () => {
  it('a changed earlier decision leaves later ones attached, and flags the stale one', () => {
    const s = scene({ a: EARLY, ...five })
      .start()
      .review();
    s.decide('later', 'b').decide('only_a', 'b').decide('first', 'b');
    const by = (k: string) => s.g.grimoire().review?.decisions.find((d) => d.key.kind === k);
    expect(by('later')?.chosen).toBe('b');
    expect(by('later')?.stale).toBe(false);
    expect(by('only_a')?.stale).toBe(true);
    expect(s.truth('a')).toEqual(['b b']);
    s.decide('first', 'a');
    expect(by('only_a')?.chosen).toBe('b');
    expect(by('only_a')?.stale).toBe(false);
  });

  it('night resolution is deterministic', () => {
    const run = () => {
      const s = scene({ a: 'empath', b: 'mayor', c: 'imp', d: 'poisoner', e: 'sailor' }).start().nextNight();
      s.submit({ c: ['b'], d: ['a'], e: ['a'] }).review();
      const { after: _after, ...res } = s.res;
      return JSON.stringify(res);
    };
    expect(run()).toBe(run());
  });

  it('the night does not touch the stored game until dawn', () => {
    const s = scene({ a: 'empath', b: 't1', c: 'imp', d: 't2', e: 't3' })
      .start()
      .nextNight()
      .submit({ c: ['a'] })
      .review();
    expect(s.res.deaths).toEqual(['a']);
    expect(s.alive('a')).toBe(true);
  });
});

function resolveFor(s: ReturnType<typeof scene>) {
  return s.res;
}
