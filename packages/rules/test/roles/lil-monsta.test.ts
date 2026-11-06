import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'lil_monsta', bo: 'm1', cy: 't1', di: 't2', ed: 't3', fi: 't4', gu: 't5' };
const opts = { fields: { lil_monsta: { minion: 'baron' } } };
describe("Lil' Monsta", () => {
  it('needs a Minion chosen at setup', () => {
    const s = scene(cast);
    expect(s.g.grimoire().setup.checklist.find((c) => c.id === 'lil_monsta')?.done).toBe(false);
  });
  it('the extra Minion is that player, so the counts do not change', () => {
    expect(scene(cast).g.grimoire().setup.counts.target[2]).toBe(1);
  });
  it('becomes the chosen Minion at the first dawn, holding the token', () => {
    const s = scene(cast, opts).start().dawn();
    expect(s.character('ann')).toBe('baron');
    expect(s.inbox('ann')).toContain("You hold Lil' Monsta's token. You are the Demon.");
    const r = s.g.grimoire().players.find((p) => p.id === 'ann');
    expect(r?.isDemon).toBe(true);
  });
  it('the holder passes the token and kills', () => {
    const s = scene(cast, opts).start().nextNight();
    s.submit({ ann: ['bo', 'cy'] }).dawn();
    expect(s.alive('cy')).toBe(false);
    const token = Object.values(s.state.abilities).find(
      (a) => a.roleId === ('lil_monsta' as never) && a.origin.kind !== 'character',
    );
    expect(token?.holder).toEqual({ kind: 'player', id: 'bo' });
  });
  it('executing the holder kills the Demon', () => {
    const s = scene(cast, opts).start().dawn();
    s.execute('ann');
    expect(s.winners()).toContain('good');
  });
  it('a dead Minion cannot be passed to', () => {
    const s = scene(cast, opts).start().dawn();
    s.execute('bo').dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).toEqual(['ann']);
  });
});
