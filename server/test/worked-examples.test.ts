// Section 18 worked examples.
import { describe, expect, it } from 'vitest';
import { act, alive, build, nextNight, publishAndDay, resolve, resultFor, runNight, submit } from './helpers';
import { playerView } from '../src/engine/views';

describe('section 18 worked examples', () => {
  it('1. poison makes false info', () => {
    // seats: 0 empath, 1 imp (evil neighbour), 2 poisoner, ... empath neighbours are seat 6 and seat 1
    const g = build(['empath', 'imp', 'poisoner', 'chef_free', 'sailor', 'mayor', 'butler'].map((r) => (r === 'chef_free' ? 'clockmaker' : r)));
    runNight(g, { [g.p.poisoner]: { poisoner: [g.p.sailor] }, [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.butler]: { butler: [g.p.mayor] } });
    nextNight(g);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.empath] }, [g.p.imp]: { imp: [g.p.mayor] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    const res = resolve(g, { [`mayor:0:${g.p.mayor}`]: 'die' });
    const r = resultFor(res, g.p.empath)!;
    expect(r.trueLines[0]).toMatch(/^1 /);
    expect(r.impaired).toBe(true);
    expect(r.causes).toContain('poisoned:poisoner');
    expect(r.suggestedLines[0]).toMatch(/^(0|2) /);
    expect(r.finalLines).toEqual(r.suggestedLines);
    publishAndDay(g);
    const v = playerView(g.s, g.p.empath, 0);
    const msg = v.me.messages.find((m) => m.title === 'Empath')!;
    expect(msg.lines).toEqual(r.suggestedLines);
    expect(JSON.stringify(v)).not.toMatch(/impaired|causes|poisoned/i);
  });

  it('2. sober Sailor cannot die; poisoned Sailor dies', () => {
    const g = build(['sailor', 'imp', 'poisoner', 'empath', 'butler']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.poisoner]: { poisoner: [g.p.empath] } });
    nextNight(g);
    submit(g, { [g.p.sailor]: { sailor: [g.p.sailor] }, [g.p.imp]: { imp: [g.p.sailor] } });
    // Sailor chose self: Sailor is drunk tonight -> no protection. Use a different target instead.
    submit(g, { [g.p.sailor]: { sailor: [g.p.empath] } });
    let res = resolve(g, { [`sailor:${g.p.sailor}`]: g.p.empath });
    expect(res.log.join('\n')).toMatch(/Sailor can't die/);
    expect(res.deaths).toEqual([]);
    // Now with the Poisoner on the Sailor
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.sailor] } });
    res = resolve(g, { [`sailor:${g.p.sailor}`]: g.p.empath });
    expect(res.deaths).toEqual([g.p.sailor]);
  });

  it('3. Innkeeper protects from the Imp but not the Assassin', () => {
    const g = build(['innkeeper', 'imp', 'assassin', 'empath', 'butler', 'clockmaker']);
    runNight(g, {});
    nextNight(g);
    submit(g, { [g.p.innkeeper]: { innkeeper: [g.p.empath, g.p.butler] }, [g.p.imp]: { imp: [g.p.empath] }, [g.p.assassin]: { assassin: 'decline' } });
    let res = resolve(g);
    expect(res.deaths).toEqual([]);
    expect(res.log.join('\n')).toMatch(/protected by the Innkeeper/);
    act(g, { type: 'reopen_collecting' });
    submit(g, { [g.p.assassin]: { assassin: [g.p.empath] }, [g.p.imp]: { imp: [g.p.clockmaker] } });
    res = resolve(g);
    expect(res.deaths).toContain(g.p.empath);
  });

  it('4. Mayor: tails recommends a redirect, which may be a protected player', () => {
    let found = false;
    for (let seed = 1; seed < 60 && !found; seed++) {
      const g = build(['mayor', 'imp', 'innkeeper', 'empath', 'butler', 'clockmaker']);
      runNight(g, {});
      nextNight(g, seed);
      submit(g, { [g.p.imp]: { imp: [g.p.mayor] }, [g.p.innkeeper]: { innkeeper: [g.p.empath, g.p.butler] } });
      const res = resolve(g);
      const item = res.reviewItems.find((i) => i.kind === 'mayor')!;
      expect(item).toBeTruthy();
      if (!item.default.startsWith('redirect:')) continue;
      found = true;
      const target = item.default.slice(9);
      expect(target).not.toBe(g.p.mayor);
      expect(target).not.toBe(g.p.imp);
      // Admin redirects to a protected player: nothing happens.
      const r2 = resolve(g, { [item.key]: `redirect:${g.p.empath}` });
      expect(r2.deaths).toEqual([]);
      // Admin chooses "mayor dies"
      const r3 = resolve(g, { [item.key]: 'die' });
      expect(r3.deaths).toEqual([g.p.mayor]);
    }
    expect(found).toBe(true);
  });

  it('5. Clockmaker: 7 seats, Demon seat 1, Minion seat 5 -> 3', () => {
    const g = build(['imp', 'clockmaker', 'empath', 'butler', 'poisoner', 'sailor', 'mayor']);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.mayor] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    const res = resolve(g);
    expect(resultFor(res, g.p.clockmaker)!.trueLines[0]).toMatch(/is 3 steps/);
  });

  it('6. Goon: the first chooser is drunk and the Goon takes their alignment', () => {
    const g = build(['fortune_teller', 'goon', 'imp', 'poisoner', 'empath']);
    submit(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.goon, g.p.imp] } });
    const res = resolve(g);
    const r = resultFor(res, g.p.fortune_teller)!;
    expect(r.impaired).toBe(true);
    expect(r.causes).toContain('drunk:goon');
    expect(r.trueLines[0]).toMatch(/Yes/);
    expect(r.suggestedLines[0]).toMatch(/No/);
    expect(res.after.assignments[g.p.goon].alignment).toBe('good');
    // An evil chooser turns the Goon evil
    const g2 = build(['poisoner', 'goon', 'imp', 'empath', 'butler']);
    submit(g2, { [g2.p.poisoner]: { poisoner: [g2.p.goon] } });
    const res2 = resolve(g2);
    expect(res2.after.assignments[g2.p.goon].alignment).toBe('evil');
    // The Poisoner was drunk, so the Goon is not poisoned
    expect(res2.after.effects.some((e) => e.type === 'poisoned')).toBe(false);
  });

  it('7. Po: no one on Night 1 means exactly 3 on Night 2', () => {
    const g = build(['po', 'empath', 'butler', 'clockmaker', 'sailor', 'mayor', 'poisoner', 'virgin']);
    runNight(g, {});
    nextNight(g);
    const v1 = playerView(g.s, g.p.po, 0);
    expect(v1.me.actions[0].fields.length).toBe(1);
    expect(v1.me.actions[0].allowDecline).toBe(true);
    runNight(g, { [g.p.po]: { po: 'decline' } });
    nextNight(g);
    const v2 = playerView(g.s, g.p.po, 0);
    expect(v2.me.actions[0].fields.length).toBe(3);
    expect(v2.me.actions[0].allowDecline).toBe(false);
    expect(() => submit(g, { [g.p.po]: { po: 'decline' } })).toThrow();
    expect(() => submit(g, { [g.p.po]: { po: [g.p.empath, g.p.butler] } })).toThrow();
    submit(g, { [g.p.po]: { po: [g.p.empath, g.p.butler, g.p.virgin] } });
    const res = resolve(g);
    expect(res.deaths.sort()).toEqual([g.p.empath, g.p.butler, g.p.virgin].sort());
  });

  it('8. Starpass: suggests the Scarlet Woman, Admin picks another Minion', () => {
    const g = build(['imp', 'scarlet_woman', 'poisoner', 'empath', 'butler', 'clockmaker', 'sailor']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    submit(g, { [g.p.imp]: { imp: [g.p.imp] } });
    let res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'starpass')!;
    expect(item.default).toBe(g.p.scarlet_woman);
    expect(item.options.map((o) => o.id)).toEqual(expect.arrayContaining([g.p.scarlet_woman, g.p.poisoner]));
    res = resolve(g, { [item.key]: g.p.poisoner });
    expect(res.after.assignments[g.p.poisoner].roleId).toBe('imp');
    expect(res.after.assignments[g.p.scarlet_woman].roleId).toBe('scarlet_woman');
    publishAndDay(g);
    const v = playerView(g.s, g.p.poisoner, 0);
    expect(v.me.role!.roleId).toBe('imp');
    expect(v.me.messages.some((m) => m.title === 'You are now the Imp')).toBe(true);
  });

  it('9. Shabaloth regurgitates a past victim', () => {
    const g = build(['shabaloth', 'empath', 'butler', 'clockmaker', 'sailor', 'mayor', 'poisoner', 'virgin', 'artist']);
    runNight(g, { [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.empath, g.p.butler] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    nextNight(g);
    runNight(g, { [g.p.shabaloth]: { shabaloth: [g.p.virgin, g.p.artist] }, [g.p.sailor]: { sailor: [g.p.sailor] } }, { [`shabaloth:${g.p.shabaloth}`]: 'none' });
    expect(g.s.setup.shabalothKills.sort()).toEqual([g.p.empath, g.p.butler, g.p.virgin, g.p.artist].sort());
    nextNight(g);
    submit(g, { [g.p.shabaloth]: { shabaloth: [g.p.poisoner, g.p.clockmaker] }, [g.p.sailor]: { sailor: [g.p.sailor] } });
    const res = resolve(g);
    const item = res.reviewItems.find((i) => i.kind === 'shabaloth')!;
    expect(item.options.map((o) => o.id).sort()).toEqual(['none', g.p.empath, g.p.butler, g.p.virgin, g.p.artist].sort());
    const res2 = resolve(g, { [item.key]: g.p.butler });
    expect(res2.revived).toEqual([g.p.butler]);
    publishAndDay(g);
    expect(alive(g, g.p.butler)).toBe(true);
  });

  it('10. Lil\' Monsta: Night 0 info, becomes a Minion, passes the token, FT reads yes', () => {
    const g = build(['lil_monsta', 'scarlet_woman', 'poisoner', 'fortune_teller', 'empath', 'butler', 'clockmaker']);
    const v0 = playerView(g.s, g.p.lil_monsta, 0);
    const info = v0.me.messages.find((m) => m.title === 'Demon information')!;
    expect(info.lines.join(' ')).toMatch(/Minions/);
    expect(info.lines.join(' ')).toMatch(/bluffs/);
    // Minions learn each other (not the Demon)
    const pm = playerView(g.s, g.p.poisoner, 0).me.messages;
    expect(pm.map((m) => m.title)).toEqual(['Your fellow Minions']);
    expect(pm[0].lines[0]).toMatch(/scarlet_woman/);
    runNight(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.empath, g.p.butler] } });
    const newRole = g.s.setup.lilMonstaMinionRole!;
    expect(g.s.assignments[g.p.lil_monsta].roleId).toBe(newRole);
    expect(g.s.setup.lilMonstaTokenHolderId).toBe(g.p.lil_monsta);
    nextNight(g);
    const v1 = playerView(g.s, g.p.lil_monsta, 0);
    expect(v1.me.actions.map((a) => a.key)).toContain('lil_monsta');
    submit(g, {
      [g.p.lil_monsta]: { lil_monsta: [g.p.scarlet_woman, g.p.empath], ...(newRole === 'assassin' ? { assassin: 'decline' } : newRole === 'devils_advocate' ? { devils_advocate: [g.p.butler] } : {}) },
      [g.p.fortune_teller]: { fortune_teller: [g.p.scarlet_woman, g.p.butler] },
    });
    const res = resolve(g);
    expect(res.deaths).toContain(g.p.empath);
    expect(res.after.setup.lilMonstaTokenHolderId).toBe(g.p.scarlet_woman);
    expect(resultFor(res, g.p.fortune_teller)!.trueLines[0]).toMatch(/Yes/);
  });

  it('11. Reconnect: submission intact in view; rebind keeps the seat', async () => {
    const g = build(['imp', 'empath', 'butler', 'clockmaker', 'poisoner']);
    submit(g, { [g.p.butler]: { butler: [g.p.empath] } });
    const v = playerView(g.s, g.p.butler, 0);
    expect(v.me.submitted).toBe(true);
    expect(v.me.submission!.actions.butler.values).toEqual([g.p.empath]);
    const { rebindPlayer } = await import('../src/engine/game');
    const r = rebindPlayer(g.s, g.p.butler, 'new-token');
    expect(r.ok).toBe(true);
    if (r.ok) {
      const p = r.state.players.find((x) => x.id === g.p.butler)!;
      expect(p.tokens).toContain('new-token');
      expect(p.seat).toBe(2);
    }
  });
});
