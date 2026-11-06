import { roleId, type RoleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const philosopher = defineRole({
  id: roleId('philosopher'),
  name: 'Philosopher',
  type: 'townsfolk',
  abilityText:
    'Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk.',
  night: { first: 10, other: 10 },
  flags: { oncePerGame: 'auto' },
  ability: {
    wakes: (ctx) => !ctx.ability.used,
    picker: (ctx) => ({
      title: 'Philosopher',
      prompt: 'Choose a good character to gain its ability, or wait.',
      fields: [
        {
          kind: 'role',
          label: 'Character',
          options: ctx.script.filter((r) => ctx.role(r).alignment === 'good' && r !== ctx.ability.roleId),
        },
      ],
      allowDecline: true,
      declineLabel: 'Not tonight',
    }),
    resolve(ctx) {
      const [chosen] = ctx.choice;
      if (!chosen) return;
      const role = chosen as RoleId;
      ctx.markUsed();
      if (ctx.impaired) {
        ctx.outcome('impaired: nothing gained');
      } else {
        const me = ctx.holder;
        ctx.grant(me, role, { startInfo: true });
        ctx.outcome(`gains the ${ctx.roleName(role)} ability`);
        for (const id of ctx.seated) {
          if (id === me || ctx.character(id) !== role) continue;
          ctx.addCondition(id, 'drunk', { until: 'while_source_works' });
          ctx.outcome(`${ctx.name(id)} (${ctx.roleName(role)}) is drunk while the Philosopher is alive and sober`);
        }
        if (!ctx.role(role).ability.resolve) ctx.outcome(`Reminder: ${ctx.roleName(role)} is a day or passive ability`);
      }
      ctx.inform({ truth: [`You chose the ${ctx.roleName(role)} ability.`] });
    },
  },
});
