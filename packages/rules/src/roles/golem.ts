import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const golem = defineRole({
  id: roleId('golem'),
  name: 'Golem',
  type: 'outsider',
  abilityText: 'You may only nominate once per game. When you do, if the nominee is not the Demon, they die.',
  reminder: 'Day ability. Offered when the nomination is recorded.',
  flags: { oncePerGame: 'auto', dayReminder: true },
  ability: {
    onDayEvent(ctx, e) {
      if (e.kind !== 'nomination' || e.nominator !== ctx.holder || ctx.ability.used) return;
      ctx.markUsed();
      if (ctx.impaired) {
        ctx.malfunctionIfExternal('Golem ability impaired');
        return;
      }
      if (ctx.registers(e.nominee).type === 'demon' || !ctx.isAlive(e.nominee)) return;
      ctx.prompt({
        kind: 'golem',
        subject: e.nominee,
        title: `The Golem nominated ${ctx.name(e.nominee)}`,
        description: 'The nominee is not the Demon: they die.',
        options: [
          { id: 'yes', label: 'They die' },
          { id: 'no', label: 'No' },
        ],
      });
    },
    onPrompt(ctx, _kind, subject, option) {
      if (option === 'yes' && subject) ctx.attemptKill(subject as PlayerId, 'ability_kill');
    },
  },
});
