import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { dayKill } from './lib';

export const golem = defineRole({
  id: roleId('golem'),
  name: 'Golem',
  type: 'outsider',
  abilityText: 'You may only nominate once per game. When you do, if the nominee is not the Demon, they die.',
  reminder: "Day ability. Use the Golem's day action when they nominate.",
  flags: { oncePerGame: 'auto', dayReminder: true },
  ability: {
    dayActions(ctx) {
      if (ctx.ability.used || ctx.ability.holder.kind !== 'player' || !ctx.isAlive(ctx.holder)) return [];
      return [
        {
          action: 'nominated',
          title: `Golem (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they nominate? If not the Demon, they die.',
          fields: [{ kind: 'player', label: 'Nominee', options: ctx.seated.filter((x) => x !== ctx.holder) }],
          preview: true,
          order: 90,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      const nominee = values[0] as PlayerId;
      const name = ctx.name(nominee);
      ctx.markUsed();
      if (ctx.impaired) ctx.malfunctionIfExternal('Golem ability impaired');
      if (force === 'none') {
        if (ctx.impaired) return { summary: 'The Golem is drunk or poisoned: nothing happens.', effective: false };
        if (ctx.registers(nominee).type === 'demon')
          return { summary: `${name} is the Demon: nothing happens.`, effective: false };
        if (!ctx.isAlive(nominee)) return { summary: `${name} is already dead: nothing happens.`, effective: false };
      }
      return dayKill(ctx, nominee, 'ability_kill', force);
    },
  },
});
