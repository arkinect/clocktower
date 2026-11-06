import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const oracle = defineRole({
  id: roleId('oracle'),
  name: 'Oracle',
  type: 'townsfolk',
  abilityText: 'Each night*, you learn how many dead players are evil.',
  night: { other: 320 },
  ability: {
    resolve(ctx) {
      const dead = ctx.seated.filter((x) => !ctx.isAlive(x));
      const truth = dead.filter((x) => ctx.registers(x).alignment === 'evil').length;
      ctx.informNumber(truth, 0, dead.length, (n) => [`${n} dead player${n === 1 ? ' is' : 's are'} evil.`]);
    },
  },
});
