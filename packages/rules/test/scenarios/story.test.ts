// The Storyteller's story: each night a table of rows, each day a few labelled lines.
import { describe, expect, it } from 'vitest';
import type { StoryDay, StoryNight } from '@ct/protocol';
import { scene } from '../scenario';

const cast = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 't1', ed: 't2' };

describe('the story', () => {
  const played = () => {
    const s = scene(cast)
      .start()
      .submit({ bo: ['cy'] })
      .dawn()
      .execute('di')
      .dusk()
      .submit({ ann: ['ed'], bo: ['cy'] })
      .dawn();
    return s;
  };
  const night = (s: ReturnType<typeof scene>, n: number) =>
    s.g.grimoire().story.find((e): e is StoryNight => e.kind === 'night' && e.n === n);
  const day = (s: ReturnType<typeof scene>, n: number) =>
    s.g.grimoire().story.find((e): e is StoryDay => e.kind === 'day' && e.n === n);

  it('reads Night 0, Day 1, Night 1, Day 2', () => {
    expect(
      played()
        .g.grimoire()
        .story.map((e) => `${e.kind} ${e.n}`),
    ).toEqual(['night 0', 'day 1', 'night 1', 'day 2']);
  });

  it("a poisoned Empath's row has the cause, the false information with its truth, and who was alive", () => {
    const s = played();
    const rows = night(s, 1)?.rows ?? [];
    expect(rows.map((r) => r.seat)).toEqual([0, 1, 2, 3, 4]);
    const empath = rows.find((r) => r.playerId === 'cy');
    expect(empath).toMatchObject({ character: 'empath', aliveAtStart: true, aliveAtEnd: true });
    expect(empath?.causes).toContain('poisoned:Poisoner');
    expect(empath?.received[0]?.truth).not.toBeNull();
    expect(rows.find((r) => r.playerId === 'di')).toMatchObject({ aliveAtStart: false, aliveAtEnd: false });
    expect(rows.find((r) => r.playerId === 'ed')).toMatchObject({ aliveAtStart: true, aliveAtEnd: false });
    expect(night(s, 1)?.deaths).toEqual(['ed']);
  });

  it('a day has its final execution, its deaths and its notes', () => {
    const s = scene(cast).start().dawn().execute('di');
    s.g.st({ type: 'set_notes', text: 'Loud day' });
    expect(day(s, 1)).toMatchObject({
      execution: { playerId: 'di', died: true },
      deaths: [{ playerId: 'di', cause: 'execution' }],
      notes: 'Loud day',
    });
  });

  it('a day with nothing recorded still has its card', () => {
    const s = scene(cast).start().dawn();
    expect(day(s, 1)).toMatchObject({ execution: null, deaths: [], other: [], notes: '' });
  });
});
