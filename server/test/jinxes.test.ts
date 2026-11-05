// Jinxes (shared/src/roles.ts JINXES): the data, and how the app applies the ones marked 'engine'.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { JINXES, ROLE_BY_ID, jinxBetween, jinxLabel, jinxesAmong } from '@ct/shared';
import { act, alive, build, runNight, tryAct } from './helpers';
import { setupChecklist, setupWarnings } from '../src/engine/setup';

/** it('…'), describe("…") or test(`…`): group 1 is the quote, group 2 the name. */
const TEST_NAME = /\b(?:it|describe|test)\(\s*('|"|\x60)((?:\\.|(?!\1).)*)\1/g;

/** Every test and describe name in the server and client test files. */
function testNames(): string[] {
  const dirs = [__dirname, path.join(__dirname, '..', '..', 'client', 'test')];
  const out: string[] = [];
  for (const dir of dirs) {
    for (const f of fs.readdirSync(dir).filter((x) => /\.test\.tsx?$/.test(x))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(TEST_NAME)) out.push(m[2].replace(/\\(.)/g, '$1'));
    }
  }
  return out;
}

describe('jinx data', () => {
  it('every jinx names two different roles in ROLES, and no pair appears twice', () => {
    const pairs = new Set<string>();
    for (const j of JINXES) {
      expect(ROLE_BY_ID[j.a], j.a).toBeDefined();
      expect(ROLE_BY_ID[j.b], j.b).toBeDefined();
      expect(j.a).not.toBe(j.b);
      const key = [j.a, j.b].sort().join('&');
      expect(pairs.has(key), key).toBe(false);
      pairs.add(key);
      expect(j.text.length).toBeGreaterThan(0);
      expect(j.source).toMatch(/^https:\/\/wiki\.bloodontheclocktower\.com\//);
    }
  });

  it('every engine jinx has a test named after its label', () => {
    const names = testNames();
    for (const j of JINXES.filter((x) => x.handling === 'engine')) {
      expect(names.some((n) => n.startsWith(`${jinxLabel(j)}:`)), jinxLabel(j)).toBe(true);
    }
  });

  it('labels, lookup in either order, and the jinxes among a script', () => {
    const j = jinxBetween('huntsman', 'marionette')!;
    expect(jinxLabel(j)).toBe('Jinx (Marionette & Huntsman)');
    expect(jinxBetween('marionette', 'huntsman')).toBe(j);
    expect(jinxBetween('imp', 'empath')).toBeUndefined();
    expect(jinxesAmong(['marionette', 'huntsman', 'imp'])).toEqual([j]);
    expect(jinxesAmong(['marionette', 'imp'])).toEqual([]);
  });
});

describe('jinxes the app applies', () => {
  it('Jinx (Marionette & Huntsman): a Marionette who thinks they are the Huntsman needs the Damsel in play', () => {
    build(['imp', 'marionette', 'empath', 'butler', 'sailor', 'clockmaker'], (g) => {
      act(g, { type: 'set_believed_role', playerId: g.p.marionette, roleId: 'huntsman' });
      const item = () => setupChecklist(g.s).find((c) => c.id === 'jinx:marionette:huntsman');
      expect(item()).toMatchObject({ done: false, blocking: true });
      expect(item()!.label).toMatch(/^Jinx \(Marionette & Huntsman\): /);
      expect(tryAct(g, { type: 'begin_night0' }).ok).toBe(false);
      act(g, { type: 'assign_role', playerId: g.p.butler, roleId: 'damsel' });
      act(g, { type: 'suggest_bluffs' });
      expect(item()).toMatchObject({ done: true, blocking: true });
    });
  });

  it('Jinx (Marionette & Huntsman): no item when the Marionette thinks they are another role', () => {
    build(['imp', 'marionette', 'empath', 'butler', 'sailor', 'clockmaker'], (g) => {
      expect(setupChecklist(g.s).some((c) => c.id.startsWith('jinx:'))).toBe(false);
    });
  });

  it('Jinx (Marionette & Balloonist): Setup warns that an Outsider may be added', () => {
    build(['imp', 'marionette', 'empath', 'butler', 'sailor', 'clockmaker'], (g) => {
      const jinxWarnings = () => setupWarnings(g.s).filter((w) => w.startsWith('Jinx (Marionette & Balloonist): '));
      expect(jinxWarnings()).toEqual([]);
      act(g, { type: 'set_believed_role', playerId: g.p.marionette, roleId: 'balloonist' });
      expect(jinxWarnings()).toEqual(['Jinx (Marionette & Balloonist): the Marionette thinks they are the Balloonist, so an Outsider may be added.']);
    });
  });

  it('Jinx (Lil\' Monsta & Scarlet Woman): the Scarlet Woman babysits Lil\' Monsta when its babysitter dies with 5 or more alive', () => {
    const g = build(['lil_monsta', 'scarlet_woman', 'poisoner', 'fortune_teller', 'empath', 'butler', 'clockmaker']);
    runNight(g, { [g.p.fortune_teller]: { fortune_teller: [g.p.empath, g.p.butler] } });
    const sitter = g.s.setup.lilMonstaTokenHolderId!;
    expect(sitter).toBe(g.p.lil_monsta);
    act(g, { type: 'record_execution', playerId: sitter, died: true });
    expect(alive(g, sitter)).toBe(false);
    expect(g.s.dayPrompts).toHaveLength(1);
    expect(g.s.dayPrompts[0]).toMatchObject({ kind: 'scarlet_woman', demonId: sitter, scarletId: g.p.scarlet_woman });
    act(g, { type: 'resolve_day_prompt', id: g.s.dayPrompts[0].id, accept: true });
    expect(g.s.setup.lilMonstaTokenHolderId).toBe(g.p.scarlet_woman);
    expect(g.s.assignments[g.p.scarlet_woman].roleId).toBe('scarlet_woman');
  });
});

describe('jinxes shown only', () => {
  it('reminder jinxes are not applied by the engine', () => {
    expect(JINXES.filter((j) => j.handling === 'reminder').map(jinxLabel)).toEqual([
      'Jinx (Mathematician & Drunk)', 'Jinx (Mathematician & Marionette)', 'Jinx (Marionette & Lil\' Monsta)',
      'Jinx (Mastermind & Vigormortis)', 'Jinx (Lil\' Monsta & Psychopath)', 'Jinx (Butler & Organ Grinder)',
    ]);
  });
});
