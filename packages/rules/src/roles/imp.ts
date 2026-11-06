import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers, handOverDemon } from './lib';

export const imp = defineRole({
  id: roleId('imp'),
  name: 'Imp',
  type: 'demon',
  abilityText: 'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.',
  night: { other: 110 },
  ability: {
    picker: (ctx) =>
      choosePlayers(
        'Imp',
        'Choose a player: they die. If you choose yourself, a Minion becomes the Imp.',
        1,
        ctx.seated,
      ),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      const me = ctx.holder;
      if (ctx.impaired) {
        ctx.outcome('impaired: no kill');
        return;
      }
      if (t !== me) {
        ctx.attemptKill(t, 'demon_attack');
        return;
      }
      if (!ctx.attemptKill(me, 'demon_attack', { demonHandover: true })) return;
      const minions = ctx.alive.filter((x) => ctx.typeOf(x) === 'minion');
      if (!minions.length) {
        ctx.outcome('starpass: no living Minion');
        return;
      }
      const heir = minions.find((x) => ctx.role(ctx.character(x) as typeof ctx.ability.roleId).flags.demonHeir);
      const chosen = ctx.decide({
        key: { kind: 'starpass' },
        title: 'Starpass: which Minion becomes the Imp?',
        description: `${ctx.name(me)} killed themselves.`,
        options: minions.map((m) => ({ id: m, label: `${ctx.name(m)} (${ctx.roleName(ctx.character(m))})` })),
        default: heir ?? ctx.rng('heir').pick(minions),
      });
      handOverDemon(ctx, chosen, me);
      ctx.outcome(`${ctx.name(chosen)} becomes the Imp`);
    },
  },
});
