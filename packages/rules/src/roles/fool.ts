import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const fool = defineRole({
  id: roleId('fool'),
  name: 'Fool',
  type: 'townsfolk',
  abilityText: "The first time you die, you don't.",
  reminder: 'First death is prevented, by night or by execution.',
  flags: { oncePerGame: 'manual', interceptPriority: 40, passive: true },
  ability: {
    interceptKill(ctx, kill) {
      if (kill.unstoppable || ctx.ability.holder.kind !== 'player') return 'pass';
      if (kill.target !== ctx.holder || ctx.ability.used) return 'pass';
      if (!ctx.impaired) {
        ctx.markUsed();
        ctx.outcome(`${ctx.name(kill.target)} survives: Fool's first death (Fool now used)`);
        return 'prevent';
      }
      ctx.malfunctionIfExternal('Fool protection failed');
      return 'pass';
    },
  },
});
