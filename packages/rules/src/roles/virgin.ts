import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const virgin = defineRole({
  id: roleId('virgin'),
  name: 'Virgin',
  type: 'townsfolk',
  abilityText: 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.',
  reminder: "Day ability. Use the Virgin's day action when she is first nominated.",
  flags: { oncePerGame: 'auto', dayReminder: true },
  ability: {
    dayActions(ctx) {
      if (ctx.ability.used || ctx.ability.holder.kind !== 'player') return [];
      return [
        {
          action: 'nominated',
          title: `Virgin (${ctx.name(ctx.holder)})`,
          prompt: 'Who nominated them? Only the first nomination counts.',
          fields: [{ kind: 'player', label: 'Nominator', options: ctx.seated.filter((x) => x !== ctx.holder) }],
          preview: true,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      const nominator = values[0] as PlayerId;
      const name = ctx.name(nominator);
      const townsfolk = ctx.registers(nominator, 'character').type === 'townsfolk';
      ctx.markUsed();
      if (ctx.impaired) ctx.malfunctionIfExternal('Virgin ability impaired');
      if (force === 'fail') return { summary: `${name} is not executed (forced).`, effective: false };
      if (force === 'none') {
        if (ctx.impaired) return { summary: 'The Virgin is drunk or poisoned: nothing happens.', effective: false };
        if (!townsfolk) return { summary: `${name} is not a Townsfolk: nothing happens.`, effective: false };
      }
      // Today's execution: what it triggers for others (the Cannibal) waits for dusk, like any execution.
      ctx.execute(nominator);
      return { summary: `${name} is executed${force === 'success' ? ' (forced)' : ''}.`, effective: true };
    },
  },
});
