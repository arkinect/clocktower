import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

describe('Oracle', () => {
  it('counts evil among the dead, from the first night after', () => {
    const s = scene({ ann: 'oracle', bo: 'm1', cy: 't1', di: 't2', ed: 'd1' }).start();
    expect(s.truth('ann')).toEqual([]);
    s.dawn().execute('bo').dusk();
    expect(s.truth('ann')).toEqual(['1 dead player is evil.']);
  });

  const chars = { ann: 'oracle', bo: 'imp', cy: 'poisoner', di: 'professor', ed: 'empath', fi: 'butler' };
  const twoDead = () => scene(chars).start().dawn().kill('cy').kill('ed').dusk();

  it('impaired, hears a false count no higher than the dead', () => {
    const s = twoDead();
    s.g.st({ type: 'add_condition', target: s.ids[0] as never, condition: 'drunk' });
    expect(s.row('ann').impaired).toBe(true);
    expect(s.row('ann').truth).toEqual(['1 dead player is evil.']);
    expect(s.row('ann').suggested[0]).toMatch(/^(0|2) /);
  });
  it('a player revived earlier that night no longer counts', () => {
    // An evil Empath, so that the count changes with them.
    const s = scene(chars).start().dawn();
    s.g.st({ type: 'set_alignment', playerId: s.ids[4] as never, alignment: 'evil' });
    s.kill('cy').kill('ed').dusk();
    expect(s.truth('ann')).toEqual(['2 dead players are evil.']);
    s.submit({ di: ['ed'] });
    expect(s.truth('ann')).toEqual(['1 dead player is evil.']);
  });
});
