// The script as a list of role ids (design.md section 5.5, schema v6).
import { describe, expect, it } from 'vitest';
import { ROLES } from '@ct/shared';
import { act, build, tryAct } from './helpers';
import { createGame } from '../src/engine/game';
import { v6 } from '../src/engine/migrations/v6';
import { bluffCandidates, enabledRoles, onScript, setupChecklist } from '../src/engine/setup';
import { adminView, playerView } from '../src/engine/views';

describe('script', () => {
  it('the v6 step keeps the roles that were on', () => {
    const s: Record<string, unknown> = { enabledRoles: { empath: true, imp: true, poisoner: false } };
    v6(s);
    expect(s).toEqual({ script: ['empath', 'imp'], endedReason: null });
  });

  it('a new game has every role on the script', () => {
    expect(createGame('x', 0).script).toEqual(ROLES.map((r) => r.id));
  });

  it('toggles add and remove ids, and All/None set the whole script', () => {
    const g = build(['imp', 'empath', 'sailor', 'butler', 'poisoner']);
    act(g, { type: 'set_role_enabled', roleId: 'gambler', enabled: false });
    act(g, { type: 'set_role_enabled', roleId: 'gambler', enabled: false });
    expect(g.s.script).not.toContain('gambler');
    act(g, { type: 'set_role_enabled', roleId: 'gambler', enabled: true });
    act(g, { type: 'set_role_enabled', roleId: 'gambler', enabled: true });
    expect(g.s.script.filter((r) => r === 'gambler')).toHaveLength(1);
    expect(enabledRoles(g.s)).toEqual(ROLES.map((r) => r.id)); // ROLES order, whatever the stored order
    act(g, { type: 'set_all_roles_enabled', enabled: false });
    expect(g.s.script).toEqual([]);
    act(g, { type: 'set_all_roles_enabled', enabled: true });
    expect(g.s.script).toEqual(ROLES.map((r) => r.id));
  });

  it('Play again keeps the script', () => {
    const g = build(['imp', 'empath', 'sailor', 'butler', 'poisoner']);
    act(g, { type: 'set_role_enabled', roleId: 'gambler', enabled: false });
    act(g, { type: 'end_game' });
    act(g, { type: 'play_again' });
    expect(g.s.script).toEqual(ROLES.map((r) => r.id).filter((r) => r !== 'gambler'));
  });

  it('an unknown id on the script is left out of views, assignment and the Setup checklist', () => {
    const g = build(['imp', 'empath', 'sailor', 'butler', 'poisoner'], (g) => { g.s.script.push('no_such_role'); });
    expect(onScript(g.s, 'no_such_role')).toBe(false);
    expect(enabledRoles(g.s)).not.toContain('no_such_role');
    expect(playerView(g.s, g.p.empath, 0).enabledRoles).not.toContain('no_such_role');
    expect(bluffCandidates(g.s)).not.toContain('no_such_role');
    expect(tryAct(g, { type: 'assign_role', playerId: g.p.empath, roleId: 'no_such_role' }).ok).toBe(false);
    expect(JSON.stringify(setupChecklist(g.s))).not.toContain('no_such_role');
    const av = adminView(g.s, g.admin, 0, {});
    expect(JSON.stringify(av.setupChecklist) + JSON.stringify(av.warnings)).not.toContain('no_such_role');
  });
});
