// What the Grimoire's seat sheet and game controls do to the game.
import { describe, expect, it } from 'vitest';
import type { PlayerId } from '@ct/protocol';
import { defaultScript } from '../../src';
import { scene } from '../scenario';

const cast = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 't1', ed: 't2' };

describe('the Storyteller changing alignment', () => {
  it('during the game, goes in the history', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'set_alignment', playerId: 'cy' as PlayerId, alignment: 'evil' });
    expect(s.alignment('cy')).toBe('evil');
    expect(s.g.player('cy' as PlayerId).history.filter((h) => h.kind === 'alignment')).toEqual([
      { kind: 'alignment', at: { kind: 'day', n: 1 }, from: 'good', to: 'evil', reason: 'Storyteller' },
    ]);
  });

  it('during setup, is a plain set', () => {
    const s = scene(cast);
    s.g.st({ type: 'set_alignment', playerId: 'cy' as PlayerId, alignment: 'evil' });
    expect(s.alignment('cy')).toBe('evil');
    expect(s.g.player('cy' as PlayerId).history.filter((h) => h.kind === 'alignment')).toEqual([]);
  });
});

describe('New game (erase)', () => {
  it('removes everyone, the Storyteller included, and resets all but the settings', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'set_settings', countdownSeconds: 77 });
    const id = s.state.id;
    s.g.st({ type: 'new_game' });
    expect(s.state).toMatchObject({
      id,
      players: {},
      storytellerId: null,
      phase: { kind: 'lobby' },
      seats: [],
      events: [],
      abilities: {},
      conditions: [],
      script: defaultScript(),
    });
    expect(s.state.settings.countdownSeconds).toBe(77);
  });

  it('lets the next person to join claim Storyteller', () => {
    const s = scene(cast).start().dawn();
    s.g.st({ type: 'new_game' });
    s.g.as(null, { type: 'join', id: 'zed' as PlayerId, name: 'Zed', rolePreference: 'none', wantsStoryteller: true });
    expect(s.state.storytellerId).toBe('zed');
  });
});
