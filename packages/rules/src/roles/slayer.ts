import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { confirmKill, confirmedToday, dayKill, takeBack, type Confirmed } from './lib';

interface State {
  /** Today's shot, until the day ends: a second Use takes it back. */
  shot?: Confirmed | null;
}

function shoot(ctx: AbilityCtx<State>, target: PlayerId, force: 'none' | 'success' | 'fail') {
  const isDemon = ctx.registers(target).type === 'demon';
  ctx.markUsed();
  if (ctx.impaired) ctx.malfunctionIfExternal('Slayer ability impaired');
  const { outcome, confirmed } = confirmKill(ctx, target, () => {
    if (force === 'none') {
      if (ctx.impaired) return { summary: 'The Slayer is drunk or poisoned: nothing happens.', effective: false };
      if (!isDemon) return { summary: `${ctx.name(target)} is not the Demon: nothing happens.`, effective: false };
    }
    return dayKill(ctx, target, 'slayer', force);
  });
  ctx.setState({ shot: confirmed });
  return outcome;
}

export const slayer = defineRole<State>({
  id: roleId('slayer'),
  name: 'Slayer',
  type: 'townsfolk',
  autoplay: {
    claims: [{ claim: 'shot', title: 'Slayer shot', fields: ['Shooter', 'Target'], says: '{0} shoots {1}' }],
  },
  abilityText: 'Once per game, during the day, publicly choose a player: if they are the Demon, they die.',
  reminder: 'Resolve the shot in the Day panel.',
  flags: { oncePerGame: 'auto' },
  initialState: () => ({ shot: null }),
  ability: {
    dayActions(ctx) {
      const shot = confirmedToday(ctx, ctx.state.shot);
      if (!shot && (ctx.ability.used || !ctx.isAlive(ctx.holder))) return [];
      return [
        {
          action: 'shoot',
          title: `Slayer (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they shoot?',
          order: 30,
          clearable: true,
          recorded: shot ? [shot.target] : null,
          fields: [{ kind: 'player', label: 'Target', options: ctx.seated }],
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      if (!values.length) {
        const outcome = takeBack(ctx, confirmedToday(ctx, ctx.state.shot), 'Slayer shot');
        ctx.markUsed(false);
        ctx.setState({ shot: null });
        return outcome;
      }
      return shoot(ctx, values[0] as PlayerId, force);
    },
    onClaim(ctx, { values: [shooter, target] }) {
      if (target && shooter === ctx.holder && ctx.isAlive(ctx.holder) && !ctx.ability.used) shoot(ctx, target, 'none');
    },
  },
});
