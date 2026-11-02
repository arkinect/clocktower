// The Day panel's per-role lists come from shared/src/roles.ts. These are the lists it hard-coded before.
import { describe, expect, it } from 'vitest';
import { ROLES } from '@ct/shared';
import { causeLabel } from '../src/common';

const pick = (f: (r: (typeof ROLES)[number]) => unknown) => Object.fromEntries(ROLES.flatMap((r) => (f(r) ? [[r.id, f(r)]] : [])));

describe('Day panel role data', () => {
  it('used flags: ticked by the Storyteller, and set by the engine', () => {
    expect(pick((r) => r.usedFlag && !r.usedFlag.auto && r.usedFlag.key))
      .toEqual({ virgin: 'virgin_used', golem: 'golem_used', artist: 'artist_used', fool: 'fool_used', slayer: 'slayer_used' });
    expect(pick((r) => r.usedFlag?.auto && r.usedFlag.key))
      .toEqual({ assassin: 'assassin_used', seamstress: 'seamstress_used', philosopher: 'philosopher_used', huntsman: 'huntsman_used', professor: 'professor_used' });
  });

  it('day reminders, each with a reminder to show', () => {
    expect(ROLES.filter((r) => r.dayReminder).map((r) => r.id).sort())
      .toEqual(['virgin', 'golem', 'mastermind', 'psychopath', 'mayor', 'tea_lady'].sort());
    expect(ROLES.filter((r) => r.dayReminder && !r.reminder)).toEqual([]);
  });

  it('impairment causes name the role as before', () => {
    const before: Record<string, string> = {
      poisoner: 'Poisoner', sailor: 'Sailor', innkeeper: 'Innkeeper', goon: 'Goon', philosopher: 'Philosopher', pukka: 'Pukka',
      no_dashii: 'No Dashii', vigormortis: 'Vigormortis', witch: 'Witch',
    };
    for (const [id, name] of Object.entries(before)) expect(causeLabel(`poisoned:${id}`)).toBe(`Poisoned by the ${name}`);
    expect(causeLabel('drunk:admin')).toBe('Drunk (set by you)');
    expect(causeLabel('own_character')).toBe('Drunk/Marionette (own role)');
    expect(causeLabel('drunk:something_else')).toBe('Drunk by the something else');
  });
});
