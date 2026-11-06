import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const empath = defineRole({
  id: roleId('empath'),
  name: 'Empath',
  type: 'townsfolk',
  abilityText: 'Each night, you learn how many of your 2 alive neighbours are evil.',
  night: { first: 140, other: 290 },
  ability: {
    resolve(ctx) {
      const evil = ctx.aliveNeighbours(ctx.holder).filter((x) => ctx.registers(x).alignment === 'evil').length;
      ctx.informNumber(evil, 0, 2, (n) => [`${n} of your alive neighbours ${n === 1 ? 'is' : 'are'} evil.`]);
    },
  },
});
