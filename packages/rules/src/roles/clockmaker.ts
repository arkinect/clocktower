import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const clockmaker = defineRole({
  id: roleId('clockmaker'),
  name: 'Clockmaker',
  type: 'townsfolk',
  abilityText: 'You start knowing how many steps from the Demon to its nearest Minion.',
  night: { first: 130, other: 270, note: 'Only if the ability was just gained' },
  flags: { startInfo: true },
  ability: {
    resolve(ctx) {
      const ids = ctx.seated;
      const demons = ids.filter((id) => ctx.registers(id).type === 'demon');
      const minions = ids.filter((id) => !demons.includes(id) && ctx.registers(id).type === 'minion');
      let truth = 0;
      if (demons.length && minions.length) {
        truth = Math.min(...demons.flatMap((d) => minions.map((m) => ctx.seatDistance(d, m))));
      }
      const max = Math.max(1, Math.floor(ids.length / 2));
      ctx.informNumber(truth, 1, max, (n) => [`The Demon is ${n} step${n === 1 ? '' : 's'} from its nearest Minion.`]);
    },
  },
});
