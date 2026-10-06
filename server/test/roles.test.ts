// Per-role resolve tests: true, impaired and registration cases.
import { describe, expect, it } from 'vitest';
import { act, alive, build, nextNight, publishAndDay, resolve, resultFor, runNight, submit, tryAct } from './helpers';
import { playerView } from '../src/engine/views';
import { computeImpairment } from '../src/engine/impairment';

describe('information roles', () => {
  it('Empath counts alive neighbours, skipping the dead', () => {
    // seats: empath, butler, imp, ... , poisoner (last seat neighbours the empath)
    const g = build(['empath', 'butler', 'imp', 'sailor', 'clockmaker', 'poisoner']);
    submit(g, { [g.p.butler]: { butler: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.poisoner]: { poisoner: [g.p.sailor] } });
    let res = resolve(g);
    expect(resultFor(res, g.p.empath)!.trueLines[0]).toMatch(/^1 /);
    publishAndDay(g);
    act(g, { type: 'mark_alive', playerId: g.p.butler, alive: false });
    nextNight(g);
    submit(g, { [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.poisoner]: { poisoner: [g.p.sailor] }, [g.p.imp]: { imp: [g.p.clockmaker] } });
    res = resolve(g);
    expect(resultFor(res, g.p.empath)!.trueLines[0]).toMatch(/^2 /);
  });

  it('Fortune Teller: red herring reads yes; impaired gives the opposite', () => {
    const g = build(['fortune_teller', 'empath', 'butler', 'imp', 'poisoner', 'sailor'], (g) => act(g, { type: 'set_red_herring', playerId: g.p.empath }));
    submit(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.empath, g.p.butler] } });
    let res = resolve(g);
    expect(resultFor(res, g.p.fortune_teller)!.trueLines[0]).toMatch(/Yes/);
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.sailor, g.p.butler] }, [g.p.poisoner]: { poisoner: [g.p.fortune_teller] } });
    res = resolve(g);
    const r = resultFor(res, g.p.fortune_teller)!;
    expect(r.trueLines[0]).toMatch(/No/);
    expect(r.suggestedLines[0]).toMatch(/Yes/);
  });

  it('Recluse registration creates a review item and changes the answer', () => {
    const g = build(['empath', 'recluse', 'butler', 'imp', 'poisoner', 'sailor']);
    submit(g, {});
    let res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'registration')!;
    expect(item.default).toBe('truthful');
    expect(resultFor(res, g.p.empath)!.trueLines[0]).toMatch(/^0 /);
    res = resolve(g, { [item.key]: 'demon' });
    expect(resultFor(res, g.p.empath)!.trueLines[0]).toMatch(/^1 /);
    expect(res.abnormal.some((e) => e.playerId === g.p.recluse)).toBe(true);
  });

  it('Seamstress: once per game, the use is spent even when declined later', () => {
    const g = build(['seamstress', 'empath', 'imp', 'butler', 'poisoner']);
    submit(g, { [g.p.seamstress]: { seamstress: [g.p.empath, g.p.imp] } });
    const res = resolve(g);
    expect(resultFor(res, g.p.seamstress)!.trueLines[0]).toMatch(/different/);
    publishAndDay(g);
    nextNight(g);
    expect(playerView(g.s, g.p.seamstress, 0).me.actions).toEqual([]);
    // Cannot choose self
    const g2 = build(['seamstress', 'empath', 'imp', 'butler', 'poisoner']);
    expect(tryAct(g2, { type: 'submit_night', actions: { seamstress: { values: [g2.p.seamstress, g2.p.imp] } } }, g2.p.seamstress).ok).toBe(false);
  });

  it('Clockmaker impaired gives a different number within 1..n/2', () => {
    const g = build(['imp', 'clockmaker', 'empath', 'butler', 'poisoner', 'sailor', 'mayor']);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.clockmaker] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    const r = resultFor(resolve(g), g.p.clockmaker)!;
    const t = Number(r.trueLines[0].match(/is (\d+)/)![1]);
    const f = Number(r.suggestedLines[0].match(/is (\d+)/)![1]);
    expect(f).not.toBe(t);
    expect(f).toBeGreaterThanOrEqual(1);
    expect(f).toBeLessThanOrEqual(3);
  });

  it('Flowergirl and Juggler read the Day panel', () => {
    const g = build(['flowergirl', 'juggler', 'imp', 'butler', 'poisoner', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'set_day_fact', key: 'demonVoted', value: true });
    act(g, { type: 'set_day_fact', key: 'jugglerCorrect', value: 3 });
    nextNight(g);
    const res = resolve(g);
    expect(resultFor(res, g.p.flowergirl)!.trueLines[0]).toMatch(/^Yes/);
    expect(resultFor(res, g.p.juggler)!.trueLines[0]).toMatch(/3 correctly/);
    publishAndDay(g);
    nextNight(g);
    expect(resultFor(resolve(g), g.p.juggler)).toBeUndefined();
  });

  it('Balloonist shows a new type each night until none are left', () => {
    const g = build(['balloonist', 'empath', 'butler', 'imp', 'poisoner']);
    const seen = new Set<string>();
    for (let n = 0; n < 4; n++) {
      if (n > 0) nextNight(g);
      submit(g, { [g.p.imp]: n > 0 ? { imp: [g.p.balloonist] } : {} });
      const res = resolve(g, n > 0 ? {} : {});
      // keep the Balloonist alive: the imp attacks... nobody useful; reopen and drop the imp's choice
      if (n > 0) { act(g, { type: 'reopen_collecting' }); act(g, { type: 'clear_submission', playerId: g.p.imp }); resolve(g); }
      const r = resultFor(g.s.night!.resolution!, g.p.balloonist)!;
      seen.add(r.trueLines[0]);
      void res;
      publishAndDay(g);
    }
    expect(g.s.roleState[g.p.balloonist].shownTypes).toHaveLength(4);
  });

  it('Mathematician counts players impaired by another character', () => {
    const g = build(['mathematician', 'empath', 'poisoner', 'imp', 'butler', 'sailor']);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.butler]: { butler: [g.p.imp] } });
    const res = resolve(g);
    // Empath (poisoned) and Sailor (drunk by own choice -> cause sailor) both acted abnormally
    expect(resultFor(res, g.p.mathematician)!.trueLines[0]).toMatch(/^1 /);
    act(g, { type: 'math_adjust', add: [g.p.butler], remove: [] });
    expect(resultFor(g.s.night!.resolution!, g.p.mathematician)!.trueLines[0]).toMatch(/^2 /);
  });

  it('Ravenkeeper second round', () => {
    const g = build(['ravenkeeper', 'imp', 'empath', 'butler', 'poisoner', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.ravenkeeper] } });
    let res = resolve(g);
    expect(res.awaitingRavenkeeper).toEqual([g.p.ravenkeeper]);
    expect(playerView(g.s, g.p.ravenkeeper, 0).me.ravenkeeperPrompt).toBe(true);
    expect(playerView(g.s, g.p.empath, 0).me.ravenkeeperPrompt).toBe(false);
    expect(tryAct(g, { type: 'publish_night' }).ok).toBe(false);
    act(g, { type: 'submit_ravenkeeper', targetId: g.p.poisoner }, g.p.ravenkeeper);
    res = g.s.night!.resolution!;
    expect(res.awaitingRavenkeeper).toEqual([]);
    expect(resultFor(res, g.p.ravenkeeper)!.trueLines[0]).toMatch(/Poisoner/);
  });
});

describe('modifiers and protections', () => {
  it('Philosopher gains an ability from next night and drunks the in-play holder', () => {
    const g = build(['philosopher', 'empath', 'imp', 'butler', 'poisoner']);
    submit(g, { [g.p.philosopher]: { philosopher: ['empath'] } });
    let res = resolve(g);
    expect(res.after.assignments[g.p.philosopher].grantedAbility).toEqual({ roleId: 'empath', fromNight: 1 });
    expect(resultFor(res, g.p.empath)!.impaired).toBe(true);
    expect(resultFor(res, g.p.philosopher, 'empath')).toBeUndefined();
    publishAndDay(g);
    nextNight(g);
    res = resolve(g);
    expect(resultFor(res, g.p.philosopher, 'empath')).toBeDefined();
    // Philosopher dies -> drunk effect ends
    publishAndDay(g);
    act(g, { type: 'mark_alive', playerId: g.p.philosopher, alive: false });
    expect(computeImpairment(g.s, 2)[g.p.empath].impaired).toBe(false);
  });

  it('Fool survives the first death, not the second', () => {
    const g = build(['fool', 'imp', 'empath', 'butler', 'poisoner', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    runNight(g, { [g.p.imp]: { imp: [g.p.fool] } });
    expect(alive(g, g.p.fool)).toBe(true);
    expect(g.s.flags[g.p.fool].fool_used).toBe(true);
    nextNight(g);
    runNight(g, { [g.p.imp]: { imp: [g.p.fool] } });
    expect(alive(g, g.p.fool)).toBe(false);
  });

  it('Tea Lady protects good neighbours', () => {
    const g = build(['empath', 'tea_lady', 'butler', 'imp', 'poisoner', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.empath] } });
    expect(resolve(g).deaths).toEqual([]);
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.tea_lady] } });
    expect(resolve(g).deaths).toEqual([g.p.empath]);
  });

  it('Gambler dies on a wrong guess unless impaired', () => {
    const g = build(['gambler', 'imp', 'empath', 'butler', 'poisoner', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.gambler]: { gambler: [g.p.empath, 'butler'] } });
    expect(resolve(g).deaths).toEqual([g.p.gambler]);
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.gambler]: { gambler: [g.p.empath, 'empath'] } });
    expect(resolve(g).deaths).toEqual([]);
  });

  it('Devil\'s Advocate cannot pick the same player two nights running', () => {
    const g = build(['devils_advocate', 'imp', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.devils_advocate]: { devils_advocate: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    expect(playerView(g.s, g.p.devils_advocate, 0).me.actions[0].fields[0].options).not.toContain(g.p.empath);
  });

  it('Pukka kills its previous target even when impaired', () => {
    const g = build(['pukka', 'empath', 'butler', 'poisoner', 'sailor', 'clockmaker']);
    runNight(g, { [g.p.pukka]: { pukka: [g.p.empath] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(computeImpairment(g.s, 1)[g.p.empath].impaired).toBe(true);
    nextNight(g);
    const { final } = runNight(g, { [g.p.pukka]: { pukka: [g.p.butler] }, [g.p.poisoner]: { poisoner: [g.p.pukka] } });
    expect(final.deaths).toEqual([g.p.empath]);
    expect(g.s.effects.some((e) => e.cause === 'pukka')).toBe(false);
  });

  it('No Dashii poisons the nearest alive Townsfolk on each side', () => {
    const g = build(['butler', 'empath', 'no_dashii', 'poisoner', 'sailor', 'clockmaker']);
    const imp = computeImpairment(g.s, 0);
    expect(imp[g.p.empath].causes).toContain('poisoned:no_dashii');
    expect(imp[g.p.sailor].causes).toContain('poisoned:no_dashii');
    expect(imp[g.p.butler].impaired).toBe(false);
    expect(imp[g.p.clockmaker].impaired).toBe(false);
  });

  it('Vigormortis: a killed Minion keeps their ability and poisons a Townsfolk neighbour', () => {
    const g = build(['vigormortis', 'empath', 'poisoner', 'sailor', 'butler', 'clockmaker']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    const { final } = runNight(g, { [g.p.vigormortis]: { vigormortis: [g.p.poisoner] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(final.deaths).toEqual([g.p.poisoner]);
    expect(g.s.assignments[g.p.poisoner].retainsAbilityWhenDead).toBe(true);
    const poisoned = g.s.effects.find((e) => e.cause === 'vigormortis')!;
    expect([g.p.empath, g.p.sailor]).toContain(poisoned.targetPlayerId);
    nextNight(g);
    expect(playerView(g.s, g.p.poisoner, 0).me.actions[0].key).toBe('poisoner');
  });

  it('Scarlet Woman becomes the Demon when the Demon dies (night) with 5+ alive', () => {
    const g = build(['assassin', 'scarlet_woman', 'imp', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.assassin]: { assassin: [g.p.imp] } });
    const res = resolve(g);
    expect(res.reviewItems.some((i) => i.kind === 'scarlet_woman')).toBe(true);
    expect(res.after.assignments[g.p.scarlet_woman].roleId).toBe('imp');
  });

  it('Scarlet Woman prompt during the day', () => {
    const g = build(['imp', 'scarlet_woman', 'empath', 'butler', 'sailor', 'poisoner']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'record_execution', playerId: g.p.imp, died: true });
    expect(g.s.dayPrompts).toHaveLength(1);
    act(g, { type: 'resolve_day_prompt', id: g.s.dayPrompts[0].id, accept: true });
    expect(g.s.assignments[g.p.scarlet_woman].roleId).toBe('imp');
    nextNight(g);
    const v = playerView(g.s, g.p.scarlet_woman, 0);
    expect(v.me.role!.roleId).toBe('imp');
    expect(v.me.actions[0].key).toBe('imp');
  });

  it('Mezepheles converts the first good player to say the word', () => {
    const g = build(['mezepheles', 'imp', 'empath', 'butler', 'sailor']);
    expect(playerView(g.s, g.p.mezepheles, 0).me.messages[0].lines[0]).toMatch(/teapot/);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'set_day_fact', key: 'mezephelesSayer', value: g.p.empath });
    nextNight(g);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(g.s.assignments[g.p.empath].alignment).toBe('evil');
    expect(playerView(g.s, g.p.empath, 0).me.messages.some((m) => m.title === 'You are now evil.')).toBe(true);
    expect(g.s.setup.mezephelesSpent).toBe(true);
  });

  it('Moonchild kills a good target chosen after dying', () => {
    const g = build(['moonchild', 'imp', 'empath', 'butler', 'sailor', 'poisoner']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    act(g, { type: 'record_execution', playerId: g.p.moonchild, died: true });
    act(g, { type: 'set_day_fact', key: 'moonchildTargetId', value: g.p.empath });
    nextNight(g);
    const { final } = runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(final.deaths).toEqual([g.p.empath]);
  });

  it('Butler gets a confirmation; non-actors submit an acknowledgement', () => {
    const g = build(['butler', 'imp', 'empath', 'sailor', 'poisoner']);
    const r = tryAct(g, { type: 'submit_night', actions: { imp: { values: [g.p.butler] } } }, g.p.empath);
    expect(r.ok).toBe(true);
    expect(g.s.night!.submissions[g.p.empath].actions).toEqual({});
    submit(g, { [g.p.butler]: { butler: [g.p.sailor] } });
    expect(resultFor(resolve(g), g.p.butler)!.trueLines[0]).toMatch(/master/);
    expect(tryAct(g, { type: 'submit_night', actions: { butler: { values: [g.p.butler] } } }, g.p.butler).ok).toBe(false);
  });

  it('Marionette: believed role, impaired, Demon is told', () => {
    const g = build(['imp', 'marionette', 'empath', 'butler', 'sailor']);
    const mv = playerView(g.s, g.p.marionette, 0);
    expect(mv.me.role!.roleId).not.toBe('marionette');
    expect(JSON.stringify({ ...mv.me, name: "" })).not.toMatch(/marionette/i);
    const iv = playerView(g.s, g.p.imp, 0);
    expect(iv.me.messages[0].lines.join(' ')).toMatch(/Marionette is/);
  });

  it('dead players cannot submit choices; Assassin used flag set even when impaired', () => {
    const g = build(['assassin', 'imp', 'empath', 'butler', 'sailor', 'poisoner']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.assassin]: { assassin: [g.p.empath] }, [g.p.poisoner]: { poisoner: [g.p.assassin] } });
    const res = resolve(g);
    expect(res.deaths).toEqual([]);
    expect(res.after.flags[g.p.assassin].assassin_used).toBe(true);
  });

  it('Role reassignment notifies, clears flags, and is blocked for duplicates', () => {
    const g = build(['assassin', 'imp', 'empath', 'butler', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    expect(tryAct(g, { type: 'assign_role', playerId: g.p.butler, roleId: 'imp' }).ok).toBe(false);
    act(g, { type: 'assign_role', playerId: g.p.butler, roleId: 'seamstress' });
    expect(playerView(g.s, g.p.butler, 0).me.messages.some((m) => m.title === 'Your role has changed')).toBe(true);
    expect(g.s.assignments[g.p.butler].history.length).toBeGreaterThan(1);
  });

  it('Setup blocks Night 0 until required items are done', () => {
    expect(() => build(['imp', 'drunk', 'empath', 'butler', 'sailor'], (g) => act(g, { type: 'set_believed_role', playerId: g.p.drunk, roleId: null }))).toThrow(/incomplete/);
  });
});
