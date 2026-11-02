// Worked examples for the nine roles added in schema v2 (design.md section 18).
import { describe, expect, it } from 'vitest';
import type { GameState } from '@ct/shared';
import { act, alive, build, nextNight, publishAndDay, resolve, resultFor, runNight, submit, tryAct } from './helpers';
import { playerView } from '../src/engine/views';
import { actionSpecs } from '../src/engine/actions';
import { setupChecklist, targetCounts } from '../src/engine/setup';
import { migrate } from '../src/engine/migrate';
import { createGame } from '../src/engine/game';

const godfatherSet = (g: Parameters<NonNullable<Parameters<typeof build>[1]>>[0]) => act(g, { type: 'set_godfather_outsiders', value: 1 });

describe('new roles', () => {
  it('1. Oracle counts dead evil players; Professor revive lowers it; impaired is false', () => {
    const g = build(['oracle', 'imp', 'poisoner', 'professor', 'empath', 'butler', 'sailor', 'mayor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.poisoner]: { poisoner: [g.p.mayor] } });
    act(g, { type: 'mark_alive', playerId: g.p.poisoner, alive: false });
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    nextNight(g);
    submit(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    let res = resolve(g);
    expect(resultFor(res, g.p.oracle)!.trueLines[0]).toMatch(/^1 dead player is evil/);
    // impaired: 0..2 but not 1
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.sailor]: { sailor: [g.p.oracle] } });
    res = resolve(g, { [`sailor:${g.p.sailor}`]: g.p.oracle });
    const r = resultFor(res, g.p.oracle)!;
    expect(r.impaired).toBe(true);
    expect(r.suggestedLines[0]).toMatch(/^(0|2) /);
  });

  it('1b. Oracle: a revived player is no longer counted as dead', () => {
    const g = build(['oracle', 'imp', 'poisoner', 'professor', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'mark_alive', playerId: g.p.empath, alive: false });
    act(g, { type: 'mark_alive', playerId: g.p.poisoner, alive: false });
    nextNight(g);
    submit(g, { [g.p.professor]: { professor: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    const res = resolve(g);
    expect(res.revived).toEqual([g.p.empath]);
    expect(resultFor(res, g.p.oracle)!.trueLines[0]).toMatch(/^1 /);
    expect(resultFor(res, g.p.professor)!.trueLines[0]).toMatch(/You chose/);
    // revived Empath does not act tonight
    expect(resultFor(res, g.p.empath)).toBeUndefined();
  });

  it('2. Gossip: True kills the chosen victim; Sailor survives; poisoned Gossip kills nobody', () => {
    const g = build(['gossip', 'imp', 'poisoner', 'empath', 'butler', 'sailor', 'clockmaker']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'set_day_fact', key: 'gossipStatement', value: 'true' });
    nextNight(g);
    submit(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    let res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'gossip_victim')!;
    expect(item).toBeTruthy();
    res = resolve(g, { [item.key]: g.p.empath });
    expect(res.deaths).toEqual([g.p.empath]);
    // Gossip killed by the Imp earlier still resolves
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.imp]: { imp: [g.p.gossip] } });
    res = resolve(g, { [item.key]: g.p.butler });
    expect(res.deaths.sort()).toEqual([g.p.gossip, g.p.butler].sort());
    // Poisoned gossip
    act(g, { type: 'reopen_collecting' });
    act(g, { type: 'clear_submission', playerId: g.p.imp });
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.gossip] } });
    res = resolve(g);
    expect(res.deaths).toEqual([]);
  });

  it('2b. Gossip: False/None does nothing', () => {
    const g = build(['gossip', 'imp', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'set_day_fact', key: 'gossipStatement', value: 'false' });
    nextNight(g);
    const res = resolve(g);
    expect(res.reviewItems.some((i) => i.kind === 'gossip_victim')).toBe(false);
  });

  it('3. Huntsman converts the Damsel; feedback is identical; second use rejected', () => {
    const g = build(['huntsman', 'damsel', 'imp', 'poisoner', 'empath', 'sailor']);
    submit(g, { [g.p.huntsman]: { huntsman: [g.p.damsel] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    const res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'huntsman_new_role')!;
    const newRole = item.default;
    expect(['huntsman', 'empath', 'sailor']).not.toContain(newRole);
    expect(resultFor(res, g.p.huntsman)!.trueLines).toEqual([`You chose ${g.s.players.find((p) => p.id === g.p.damsel)!.name}.`]);
    publishAndDay(g);
    expect(g.s.assignments[g.p.damsel].roleId).toBe(newRole);
    expect(playerView(g.s, g.p.damsel, 0).me.messages.some((m) => m.title.startsWith('Your role is now'))).toBe(true);
    nextNight(g);
    expect(actionSpecs(g.s, g.p.huntsman)).toEqual([]);
  });

  it('4. Professor: Townsfolk revived; Drunk/Outsider not; tonight\'s victims not offered; Shabaloth list cleared', () => {
    const g = build(['professor', 'shabaloth', 'empath', 'drunk', 'butler', 'sailor', 'poisoner', 'clockmaker']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.empath, g.p.drunk] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(g.s.setup.shabalothKills.sort()).toEqual([g.p.empath, g.p.drunk].sort());
    nextNight(g);
    const opts = actionSpecs(g.s, g.p.professor)[0].fields[0].options;
    expect(opts.sort()).toEqual([g.p.empath, g.p.drunk].sort());
    submit(g, { [g.p.professor]: { professor: [g.p.drunk] }, [g.p.shabaloth]: { shabaloth: [g.p.butler, g.p.clockmaker] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    let res = resolve(g, { [`shabaloth:${g.p.shabaloth}`]: 'none' });
    expect(res.revived).toEqual([]);
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.professor]: { professor: [g.p.empath] } });
    res = resolve(g, { [`shabaloth:${g.p.shabaloth}`]: 'none' });
    expect(res.revived).toEqual([g.p.empath]);
    expect(res.after.setup.shabalothKills).not.toContain(g.p.empath);
    const p = res.after.players.find((x) => x.id === g.p.empath)!;
    expect(p.alive && p.deadAt === null && !p.ghostVoteUsed).toBe(true);
  });

  it('5. Slayer: shoots the Imp; poisoned shot spends the use; red herring not killed', () => {
    const g = build(['slayer', 'imp', 'poisoner', 'fortune_teller', 'empath', 'butler', 'sailor'], (g) => act(g, { type: 'set_red_herring', playerId: g.p.empath }));
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.fortune_teller]: { fortune_teller: [g.p.butler, g.p.empath] } });
    const pre = act(g, { type: 'day_kill', kind: 'slayer', sourceId: g.p.slayer, targetId: g.p.empath, mode: 'preview' });
    expect((pre.data as { wouldDie: boolean }).wouldDie).toBe(false);
    // A poisoned Slayer's shot at the Imp does nothing, and the use is spent.
    act(g, { type: 'add_effect', targetId: g.p.slayer, effectType: 'poisoned' });
    act(g, { type: 'day_kill', kind: 'slayer', sourceId: g.p.slayer, targetId: g.p.imp, mode: 'accept' });
    expect(g.s.flags[g.p.slayer].slayer_used).toBe(true);
    expect(alive(g, g.p.imp)).toBe(true);
  });

  it('5b. Slayer: kills the Demon and the use is spent; second shot rejected', () => {
    const g = build(['slayer', 'imp', 'poisoner', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    const pre = act(g, { type: 'day_kill', kind: 'slayer', sourceId: g.p.slayer, targetId: g.p.imp, mode: 'preview' });
    expect((pre.data as { wouldDie: boolean }).wouldDie).toBe(true);
    act(g, { type: 'day_kill', kind: 'slayer', sourceId: g.p.slayer, targetId: g.p.imp, mode: 'accept' });
    expect(alive(g, g.p.imp)).toBe(false);
    expect(g.s.players.find((p) => p.id === g.p.imp)!.deadAt).toEqual({ phase: 'day', number: 1 });
    expect(tryAct(g, { type: 'day_kill', kind: 'slayer', sourceId: g.p.slayer, targetId: g.p.imp, mode: 'preview' }).ok).toBe(false);
  });

  it('6. Damsel: Minions notified; correct guess banner; second guess rejected', () => {
    const g = build(['damsel', 'imp', 'poisoner', 'marionette', 'empath', 'sailor']);
    expect(playerView(g.s, g.p.poisoner, 0).me.messages.some((m) => m.lines.includes('A Damsel is in play.'))).toBe(true);
    expect(playerView(g.s, g.p.marionette, 0).me.messages.some((m) => m.lines.includes('A Damsel is in play.'))).toBe(false);
    expect(playerView(g.s, g.p.imp, 0).me.messages.some((m) => m.lines.includes('A Damsel is in play.'))).toBe(false);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    const r = act(g, { type: 'damsel_guess', targetId: g.p.damsel });
    expect((r.data as { outcome: string }).outcome).toBe('win');
    expect(tryAct(g, { type: 'damsel_guess', targetId: g.p.damsel }).ok).toBe(false);
  });

  it('7. Godfather: Night 0 info; trigger after an Outsider dies in the day; otherwise no picker', () => {
    const g = build(['godfather', 'imp', 'butler', 'drunk', 'empath', 'sailor', 'mayor'], godfatherSet);
    submit(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    let res = resolve(g);
    expect(resultFor(res, g.p.godfather)!.trueLines[0]).toMatch(/Outsiders in play: (Butler, Drunk|Drunk, Butler)/);
    publishAndDay(g);
    nextNight(g);
    expect(actionSpecs(g.s, g.p.godfather)).toEqual([]);
    expect(tryAct(g, { type: 'submit_night', actions: { godfather: { values: [g.p.empath] } } }, g.p.godfather).ok).toBe(true);
    expect(g.s.night!.submissions[g.p.godfather].actions).toEqual({});
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'record_execution', playerId: g.p.butler, died: true });
    nextNight(g);
    expect(actionSpecs(g.s, g.p.godfather)[0].key).toBe('godfather');
    submit(g, { [g.p.godfather]: { godfather: [g.p.mayor] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    res = resolve(g);
    expect(res.reviewItems.some((i) => i.kind === 'mayor')).toBe(true);
    expect(res.reviewItems.find((i) => i.key === 'godfather_trigger')!.default).toBe('yes');
  });

  it('7b. Godfather counts: +1 / -1, and -1 not allowed when the chart has 0 Outsiders', () => {
    const g = build(['godfather', 'imp', 'butler', 'empath', 'sailor', 'mayor', 'clockmaker', 'oracle'], godfatherSet); // 8 players: chart 5/1/1/1
    expect(targetCounts(g.s, 8, ['godfather', 'imp']).counts).toEqual([4, 2, 1, 1]);
    act(g, { type: 'set_godfather_outsiders', value: -1 });
    expect(targetCounts(g.s, 8, ['godfather', 'imp']).counts).toEqual([6, 0, 1, 1]);
    const g7 = build(['godfather', 'imp', 'empath', 'sailor', 'mayor', 'clockmaker', 'oracle'], godfatherSet); // 7: 0 outsiders
    expect(tryAct(g7, { type: 'set_godfather_outsiders', value: -1 }).ok).toBe(false);
  });

  it('8. Witch: curse applied in the day; 3 alive means no picker; poisoned Witch no curse', () => {
    const g = build(['witch', 'imp', 'poisoner', 'empath', 'butler', 'sailor']);
    submit(g, { [g.p.witch]: { witch: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    resolve(g);
    publishAndDay(g);
    const curse = g.s.effects.find((e) => e.type === 'witched')!;
    expect(curse.targetPlayerId).toBe(g.p.empath);
    act(g, { type: 'day_kill', kind: 'witch', sourceId: g.p.witch, targetId: g.p.empath, mode: 'accept' });
    expect(alive(g, g.p.empath)).toBe(false);
    expect(g.s.effects.some((e) => e.type === 'witched')).toBe(false);
    // poisoned witch
    nextNight(g);
    submit(g, { [g.p.witch]: { witch: [g.p.butler] }, [g.p.poisoner]: { poisoner: [g.p.witch] } });
    expect(resolve(g).after.effects.some((e) => e.type === 'witched')).toBe(false);
    publishAndDay(g);
    act(g, { type: 'mark_alive', playerId: g.p.butler, alive: false });
    act(g, { type: 'mark_alive', playerId: g.p.sailor, alive: false });
    nextNight(g);
    expect(actionSpecs(g.s, g.p.witch)).toEqual([]);
  });

  it('9. Huntsman without the Damsel blocks Night 0', () => {
    expect(() => build(['huntsman', 'imp', 'empath', 'butler', 'sailor'])).toThrow(/Damsel/);
    const g = build(['huntsman', 'damsel', 'imp', 'empath', 'sailor']);
    expect(setupChecklist(g.s).find((c) => c.id === 'huntsman')!.done).toBe(true);
  });

  it('10. Mathematician cap counts Oracle, Witch, Godfather', () => {
    // Only the cap matters; impaired Mathematician alternatives go up to N.
    const g = build(['mathematician', 'oracle', 'witch', 'godfather', 'imp', 'poisoner'], godfatherSet);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.mathematician] }, [g.p.witch]: { witch: [g.p.oracle] } });
    const r = resultFor(resolve(g), g.p.mathematician)!;
    expect(r.alternatives.length - 1).toBe(5); // oracle, witch, godfather, imp, poisoner
  });

  it('11. Migration: a v1 save loads with new roles enabled and deadAt reset', () => {
    const v1 = createGame('old', 0) as GameState & Record<string, unknown>;
    delete (v1 as Partial<GameState>).schemaVersion;
    for (const r of ['oracle', 'witch', 'damsel']) delete v1.enabledRoles[r];
    v1.players.push({ id: 'p9', name: 'X', rolePreference: 'none', isAdmin: false, seat: 0, tokens: [], alive: false, deadAt: 'night 2' as never, ghostVoteUsed: false, lastSeenAt: 0, hasSeenRole: true, joinedAt: 0 } as never);
    v1.days[1] = { dayNumber: 1, executedPlayerId: null, demonVoted: null, jugglerCorrect: null, moonchildTargetId: null, mezephelesSayer: null, notes: '' } as never;
    const s = migrate(JSON.parse(JSON.stringify(v1)));
    expect(s.schemaVersion).toBe(4);
    expect(s.story).toEqual([]);
    expect(s.enabledRoles.oracle && s.enabledRoles.witch && s.enabledRoles.damsel).toBe(true);
    expect(s.players[0].deadAt).toBeNull();
    expect(s.days[1].gossipStatement).toBe('none');
    expect(s.setup.damselGuessUsed).toBe(false);
  });

  it('12. Grandmother: learns a grandchild; dies when the Demon kills them; not for the Assassin', () => {
    const g = build(['grandmother', 'imp', 'assassin', 'empath', 'butler', 'sailor', 'clockmaker']);
    submit(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    let res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'grandmother_grandchild')!;
    res = resolve(g, { [item.key]: g.p.empath });
    expect(resultFor(res, g.p.grandmother)!.trueLines[0]).toMatch(/grandchild is .*the Empath/);
    publishAndDay(g);
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.empath] } });
    res = resolve(g);
    expect(res.reviewItems.some((i) => i.kind === 'grandmother_link')).toBe(true);
    expect(res.deaths.sort()).toEqual([g.p.empath, g.p.grandmother].sort());
    act(g, { type: 'reopen_collecting' });
    act(g, { type: 'clear_submission', playerId: g.p.imp });
    submit(g, { [g.p.assassin]: { assassin: [g.p.empath] } });
    res = resolve(g);
    expect(res.deaths).toEqual([g.p.empath]);
  });

  it('12b. Poisoned Grandmother on Night 0 gets false info and no link', () => {
    const g = build(['grandmother', 'imp', 'poisoner', 'empath', 'butler']);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.grandmother] } });
    const res = resolve(g);
    expect(resultFor(res, g.p.grandmother)!.impaired).toBe(true);
    expect(res.after.roleState[g.p.grandmother].grandchildId).toBeNull();
  });

  it('13. Revive: Shabaloth and Professor produce identical revived players', () => {
    const g = build(['professor', 'shabaloth', 'empath', 'clockmaker', 'butler', 'sailor', 'poisoner', 'mayor', 'oracle']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.empath, g.p.clockmaker] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.professor]: { professor: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.shabaloth]: { shabaloth: [g.p.butler, g.p.oracle] } });
    const res = resolve(g, { [`shabaloth:${g.p.shabaloth}`]: g.p.clockmaker });
    const a = res.after.players.find((x) => x.id === g.p.empath)!;
    const b = res.after.players.find((x) => x.id === g.p.clockmaker)!;
    for (const p of [a, b]) {
      expect(p.alive).toBe(true);
      expect(p.deadAt).toBeNull();
      expect(p.ghostVoteUsed).toBe(false);
      expect(res.after.setup.shabalothKills).not.toContain(p.id);
    }
    publishAndDay(g);
    for (const id of [g.p.empath, g.p.clockmaker]) expect(playerView(g.s, id, 0).me.messages.some((m) => m.title === 'You are alive again')).toBe(true);
  });
});
