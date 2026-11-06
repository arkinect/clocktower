import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const teaLady = defineRole({
  id: roleId('tea_lady'),
  name: 'Tea Lady',
  type: 'townsfolk',
  abilityText: "If both your alive neighbours are good, they can't die.",
  reminder: 'Protects night kills automatically. Apply to executions yourself.',
  flags: { dayReminder: true, interceptPriority: 30, passive: true },
  ability: {
    interceptKill(ctx, kill) {
      if (kill.unstoppable || ctx.ability.holder.kind !== 'player' || ctx.believed) return 'pass';
      const me = ctx.holder;
      if (!ctx.isAlive(me)) return 'pass';
      const nb = ctx.aliveNeighbours(me);
      if (!nb.includes(kill.target) || nb.length < 2) return 'pass';
      if (!nb.every((x) => ctx.registers(x).alignment === 'good')) return 'pass';
      if (!ctx.impaired) {
        ctx.outcome(`${ctx.name(kill.target)} survives: neighbour of the Tea Lady (${ctx.name(me)})`);
        return 'prevent';
      }
      ctx.malfunctionIfExternal('Tea Lady protection failed');
      return 'pass';
    },
  },
});
