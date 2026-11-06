import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const virgin = defineRole({
  id: roleId('virgin'),
  name: 'Virgin',
  type: 'townsfolk',
  abilityText: 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.',
  reminder: 'Day ability. No effect if impaired when nominated. Offered when the nomination is recorded.',
  flags: { oncePerGame: 'auto', dayReminder: true },
  ability: {
    onDayEvent(ctx, e) {
      if (e.kind !== 'nomination' || e.nominee !== ctx.holder || ctx.ability.used) return;
      ctx.markUsed();
      if (ctx.impaired) {
        ctx.malfunctionIfExternal('Virgin ability impaired');
        return;
      }
      if (ctx.registers(e.nominator, 'character').type !== 'townsfolk') return;
      ctx.prompt({
        kind: 'virgin',
        subject: e.nominator,
        title: `${ctx.name(e.nominator)} nominated the Virgin`,
        description: 'The nominator is a Townsfolk: they are executed immediately.',
        options: [
          { id: 'yes', label: 'Execute them' },
          { id: 'no', label: 'No' },
        ],
      });
    },
    onPrompt(ctx, _kind, subject, option) {
      if (option !== 'yes' || !subject) return;
      ctx.w.events.push({ kind: 'execution', at: ctx.moment, playerId: subject as PlayerId, died: true });
      ctx.forceKill(subject as PlayerId, 'execution');
    },
  },
});
