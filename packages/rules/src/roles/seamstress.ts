import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const seamstress = defineRole({
  id: roleId('seamstress'),
  name: 'Seamstress',
  type: 'townsfolk',
  abilityText: 'Once per game, at night, choose 2 players (not yourself): you learn if they are the same alignment.',
  night: { first: 160, other: 330 },
  flags: { oncePerGame: 'auto' },
  ability: {
    wakes: (ctx) => !ctx.ability.used,
    picker: (ctx) =>
      choosePlayers(
        'Seamstress',
        'Once per game: choose 2 players (not yourself) to learn if they are the same alignment.',
        2,
        ctx.seated.filter((x) => x !== ctx.holder),
        { decline: 'Not tonight' },
      ),
    resolve(ctx) {
      const [a, b] = ctx.choice as PlayerId[];
      if (!a || !b) return;
      ctx.markUsed();
      const same = ctx.registers(a).alignment === ctx.registers(b).alignment;
      const fmt = (v: boolean) => [
        `${ctx.name(a)} and ${ctx.name(b)} are ${v ? 'the same alignment' : 'different alignments'}.`,
      ];
      ctx.inform({ truth: fmt(same), falseLines: fmt(!same), alternatives: [fmt(true), fmt(false)] });
    },
  },
});
