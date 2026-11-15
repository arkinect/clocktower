import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'sailor', bo: 't1', cy: 'imp', di: 't2', ed: 't3' };
describe('Sailor', () => {
  it("can't die at night", () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo'], cy: ['ann'] });
    s.decide('sailor', 'bo').dawn();
    expect(s.alive('ann')).toBe(true);
  });
  it('dies when they are the drunk one', () => {
    const s = scene(cast)
      .start()
      .nextNight()
      .submit({ ann: ['bo'], cy: ['ann'] });
    s.decide('sailor', 'ann').dawn();
    expect(s.alive('ann')).toBe(false);
  });
  it('choosing themselves makes them drunk with no decision', () => {
    const s = scene(cast)
      .start()
      .submit({ ann: ['ann'] });
    expect(s.hasDecision('sailor')).toBe(false);
    s.dawn();
    expect(s.impaired('ann')).toBe(true);
  });
  it('making the Innkeeper drunk drops the Innkeeper question, and its saved answer waits for it', () => {
    const s = scene({ ann: 'sailor', bo: 'innkeeper', cy: 'imp', di: 't2', ed: 't3' })
      .start()
      .nextNight()
      .submit({ ann: ['bo'], bo: ['di', 'ed'], cy: ['di'] });
    const other = s
      .decide('sailor', 'ann')
      .decision('innkeeper')
      .options.find((o) => o.id !== s.decision('innkeeper').default);
    s.decide('innkeeper', other?.id as string).decide('sailor', 'bo');
    expect(s.res.decisions.map((d) => d.key.kind)).toEqual(['sailor']);
    s.decide('sailor', 'ann');
    expect(s.decision('innkeeper').chosen).toBe(other?.id);
    s.decide('sailor', 'bo');
    s.g.st({ type: 'publish_dawn' });
    expect(s.state.phase.kind).toBe('day');
  });
});
