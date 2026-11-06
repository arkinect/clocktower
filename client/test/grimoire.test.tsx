// Grimoire: the Lil' Monsta token dropdown, and impairment effects shown once.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Effect, GameState } from '@ct/shared';
import { Grimoire } from '../src/admin/Grimoire';
import type { AdminCtx } from '../src/admin/AdminApp';

const LABEL = 'Monsta token holder'; // React escapes the apostrophe in "Lil' Monsta".

function render({ script = ['imp'], holder = null, effects = [], causes = [] }: { script?: string[]; holder?: string | null; effects?: Partial<Effect>[]; causes?: string[] }) {
  const s = {
    phase: 'DAY', dayNumber: 1, days: {}, script, effects, flags: {},
    players: [{ id: 'p1', name: 'Ada', seat: 0, alive: true, ghostVoteUsed: false }, { id: 'p2', name: 'Eve', seat: 1, alive: true, ghostVoteUsed: false }],
    assignments: {
      p1: { roleId: 'empath', believedRoleId: null, alignment: 'good', retainsAbilityWhenDead: false, grantedAbility: null, history: [] },
      p2: { roleId: 'poisoner', believedRoleId: null, alignment: 'evil', retainsAbilityWhenDead: false, grantedAbility: null, history: [] },
    },
    setup: { demonBluffs: [], lilMonstaTokenHolderId: holder, shabalothKills: [] },
    settings: { notifyOnRoleChange: true, countdownSeconds: 300, followUpExtensionSeconds: 60 },
  } as unknown as GameState;
  const ctx = {
    s, seated: ['p1', 'p2'], names: { p1: 'Ada', p2: 'Eve' },
    view: { impairment: { p1: { impaired: causes.length > 0, causes } }, presence: {} },
    roleOf: (id: string) => s.assignments[id]?.roleId ?? null, label: (id: string) => id, isDead: () => false, optStyle: () => undefined,
  } as unknown as AdminCtx;
  return renderToStaticMarkup(<Grimoire ctx={ctx} code="x" />);
}

const poison = { id: 'e1', type: 'poisoned', cause: 'poisoner', sourcePlayerId: 'p2', targetPlayerId: 'p1', expiry: 'until_dusk' } as Partial<Effect>;

describe('Grimoire', () => {
  it("hides the Lil' Monsta token dropdown when it is off the script and nobody holds the token", () => {
    expect(render({})).not.toContain(LABEL);
  });

  it("shows it when Lil' Monsta is on the script, or someone holds the token", () => {
    expect(render({ script: ['lil_monsta'] })).toContain(LABEL);
    expect(render({ holder: 'p1' })).toContain(LABEL);
  });

  it('a poisoned player has the chip and one compact row, not a second prose line', () => {
    const html = render({ effects: [poison], causes: ['poisoned:poisoner'] });
    expect(html).toContain('Poisoned by the Poisoner');
    expect(html).toContain('>Eve · until dusk</span>');
    expect(html).not.toContain('poisoned (Poisoner');
  });

  it('an effect that has no chip (not active right now) keeps its full line', () => {
    expect(render({ effects: [poison] })).toContain('poisoned (Poisoner, Eve, until dusk)');
  });
});
