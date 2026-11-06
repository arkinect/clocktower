import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { dayKill } from './lib';

export const slayer = defineRole({
  id: roleId('slayer'),
  name: 'Slayer',
  type: 'townsfolk',
  abilityText: 'Once per game, during the day, publicly choose a player: if they are the Demon, they die.',
  reminder: 'Resolve the shot in the Day panel.',
  flags: { oncePerGame: 'auto' },
  ability: {
    dayActions(ctx) {
      if (ctx.ability.used || !ctx.isAlive(ctx.holder)) return [];
      return [
        {
          action: 'shoot',
          title: `Slayer (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they shoot?',
          fields: [{ kind: 'player', label: 'Target', options: ctx.seated }],
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      const target = values[0] as PlayerId;
      const isDemon = ctx.registers(target).type === 'demon';
      ctx.markUsed();
      if (ctx.impaired) ctx.malfunctionIfExternal('Slayer ability impaired');
      if (force === 'none') {
        if (ctx.impaired) return { summary: 'The Slayer is drunk or poisoned: nothing happens.', effective: false };
        if (!isDemon) return { summary: `${ctx.name(target)} is not the Demon: nothing happens.`, effective: false };
      }
      return dayKill(ctx, target, 'slayer', force);
    },
  },
});
