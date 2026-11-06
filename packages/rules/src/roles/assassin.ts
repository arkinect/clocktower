import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const assassin = defineRole({
  id: roleId('assassin'),
  name: 'Assassin',
  type: 'minion',
  abilityText: 'Once per game, at night*, choose a player: they die, even if for some reason they could not.',
  night: { other: 190 },
  flags: { oncePerGame: 'auto' },
  ability: {
    wakes: (ctx) => !ctx.ability.used,
    picker: (ctx) =>
      choosePlayers(
        'Assassin',
        'Once per game: choose a player. They die, even if for some reason they could not.',
        1,
        ctx.seated,
        {
          decline: 'Not tonight',
        },
      ),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      ctx.markUsed();
      if (ctx.impaired) ctx.outcome('impaired: no death, use spent');
      else ctx.attemptKill(t, 'assassin', { unstoppable: true });
    },
  },
});
