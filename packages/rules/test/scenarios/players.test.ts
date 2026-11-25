// What a player is offered, shown and told, whatever their character.
import { describe, expect, it } from 'vitest';
import { as } from '../helpers/scene';
import { scene, ST } from '../scenario';
import { pid } from '../helpers/game';

const cast = { ann: 'imp', bo: 'poisoner', cy: 'empath', di: 'butler', ed: 'sailor', fi: 'clockmaker' };

describe('who can be chosen', () => {
  it('pickers of the living leave out a player dead at the start of the night, and refuse them', () => {
    for (const role of ['sailor', 'devils_advocate', 'huntsman']) {
      const chars = { ann: role, bo: 'imp', cy: 'poisoner', di: 'empath', ed: 'butler', fi: 'damsel', gus: 'virgin' };
      const s = scene(chars).start();
      s.submit({ ann: role === 'huntsman' ? [] : ['ed'] })
        .dawn()
        .kill('di')
        .dusk();
      const spec = s.specs('ann').find((x) => x.roleId === role);
      expect(spec?.fields[0]?.options, role).not.toContain(pid('di'));
      expect(spec?.fields[0]?.options, role).toContain(pid('fi'));
      const actions = { [spec?.key as string]: { values: [as('di')] } };
      expect(s.g.tryAs(as('ann'), { type: 'submit_night', actions }).ok, role).toBe(false);
      expect(s.g.tryAs(ST, { type: 'submit_for', playerId: as('ann'), actions }).ok, role).toBe(false);
    }
  });

  it('the others, such as the Demon and the Poisoner, include them', () => {
    const s = scene(cast).start().dawn().kill('cy').dusk();
    expect(s.specs('ann')[0]?.fields[0]?.options).toContain(pid('cy'));
    expect(s.specs('bo')[0]?.fields[0]?.options).toContain(pid('cy'));
  });

  it('a player with nothing to choose just acknowledges, and their own submission is still there', () => {
    const s = scene(cast).start();
    s.g.as(as('cy'), { type: 'submit_night', actions: {} });
    expect(s.night.submissions.get(pid('cy') as never)?.actions).toEqual({});
    s.submit({ di: ['cy'] });
    expect(s.g.view(as('di')).me.submitted).toBe(true);
    expect(Object.values(s.g.view(as('di')).me.submission ?? {})).toEqual([{ values: [pid('cy')] }]);
  });
});

describe('what is shown, and when', () => {
  it('a day death shows to players the next morning; the Storyteller sees it at once', () => {
    const s = scene(cast).start().dawn().kill('di');
    expect(s.dead('di')).toBe(true);
    expect(s.g.view(as('cy')).deadAtDawn).toEqual([]);
    s.dusk()
      .submit({ ann: ['fi'] })
      .review();
    expect(s.g.view(as('cy')).deadAtDawn).toEqual([]);
    s.dawn();
    expect([...s.g.view(as('cy')).deadAtDawn].sort()).toEqual([pid('di'), pid('fi')]);
  });

  it('each Minion learns the other Minions on night 0, not the Demon or the Marionette', () => {
    const c = {
      ann: 'imp',
      bo: 'marionette',
      cy: 'poisoner',
      di: 'scarlet_woman',
      ed: 'empath',
      fi: 'butler',
      gus: 'sailor',
    };
    const s = scene(c, { believed: { bo: 'seamstress' } }).start();
    const lines = s.g.view(as('cy')).me.messages.find((m) => m.title === 'Your fellow Minions')?.lines;
    expect(lines?.[0]).toBe('The other Minions are: di.');
    expect(JSON.stringify(s.g.view(as('cy')).me.messages)).not.toMatch(/marionette|ann/i);
    expect(s.g.view(as('bo')).me.messages).toEqual([]);
    expect(s.g.view(as('ann')).me.messages.map((m) => m.title)).toEqual(['Demon information']);
    const lone = scene(cast).start();
    expect(lone.g.view(as('bo')).me.messages[0]?.lines[0]).toBe('You are the only Minion.');
  });

  it('only a dead player can have their vote marked used, and a revive restores it', () => {
    const s = scene(cast).start().dawn();
    expect(s.g.tryAs(ST, { type: 'set_ghost_vote', playerId: as('cy'), used: true }).ok).toBe(false);
    expect(s.g.tryAs(as('cy'), { type: 'use_ghost_vote' }).ok).toBe(false);
    s.kill('cy');
    s.g.as(as('cy'), { type: 'use_ghost_vote' });
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(true);
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: false });
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(false);
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: true });
    s.g.st({ type: 'mark_alive', playerId: as('cy'), alive: true });
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(false);
  });

  it('a vote marked used, or a role seen, while the night is reviewed is kept at dawn', () => {
    const s = scene(cast).start().dawn();
    s.kill('cy').dusk().review();
    // The console is showing the review, so the night is already worked out.
    s.g.grimoire();
    s.g.st({ type: 'set_ghost_vote', playerId: as('cy'), used: true });
    s.g.as(as('bo'), { type: 'seen_role' });
    s.dawn();
    expect(s.g.view(as('cy')).me.ghostVoteUsed).toBe(true);
    expect(s.g.view(as('bo')).me.hasSeenRole).toBe(true);
    const p = scene(cast).start().dawn();
    p.kill('cy').dusk().review();
    p.g.grimoire();
    p.g.as(as('cy'), { type: 'use_ghost_vote' });
    p.dawn();
    expect(p.g.view(as('cy')).me.ghostVoteUsed).toBe(true);
  });

  it('the story is for the Storyteller only', () => {
    const s = scene(cast)
      .start()
      .submit({ bo: ['cy'] })
      .dawn();
    expect(JSON.stringify(s.g.grimoire().story)).toContain(pid('cy'));
    expect(JSON.stringify(s.g.view(as('cy')))).not.toMatch(/"story"/);
  });
});
