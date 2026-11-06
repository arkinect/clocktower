import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers, confirmChoice } from './lib';

export const professor = defineRole({
  id: roleId('professor'),
  name: 'Professor',
  type: 'townsfolk',
  abilityText: 'Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected.',
  night: { other: 220 },
  flags: { oncePerGame: 'auto' },
  ability: {
    wakes: (ctx) => ctx.n >= 1 && !ctx.ability.used,
    picker: (ctx) =>
      choosePlayers(
        'Professor',
        'Once per game: choose a dead player. If they are a Townsfolk, they are resurrected.',
        1,
        ctx.seated.filter((x) => !ctx.aliveAtDusk(x) && !ctx.isAlive(x)),
        { decline: 'Not tonight' },
      ),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      ctx.markUsed();
      confirmChoice(ctx, t);
      if (ctx.impaired) ctx.outcome('impaired: nothing happens, use spent');
      else if (ctx.aliveAtDusk(t) || ctx.isAlive(t)) ctx.outcome(`${ctx.name(t)} is not dead: nothing happens`);
      else if (ctx.typeOf(t) !== 'townsfolk') ctx.outcome(`${ctx.name(t)} is not a Townsfolk: nothing happens`);
      else ctx.revive(t, 'resurrected by the Professor');
    },
  },
});
