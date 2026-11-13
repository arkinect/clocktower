import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { confirmKill, confirmedToday, dayKill, takeBack, type Confirmed } from './lib';

interface State {
  /** Today's nomination, until the day ends: a second Use takes it back. */
  nominated?: Confirmed | null;
}

export const golem = defineRole<State>({
  id: roleId('golem'),
  name: 'Golem',
  type: 'outsider',
  abilityText: 'You may only nominate once per game. When you do, if the nominee is not the Demon, they die.',
  reminder: "Day ability. Use the Golem's day action when they nominate.",
  flags: { oncePerGame: 'auto' },
  initialState: () => ({ nominated: null }),
  ability: {
    dayActions(ctx) {
      const done = confirmedToday(ctx, ctx.state.nominated);
      if (ctx.ability.holder.kind !== 'player') return [];
      if (!done && (ctx.ability.used || !ctx.isAlive(ctx.holder))) return [];
      return [
        {
          action: 'nominated',
          title: `Golem (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they nominate?',
          fields: [{ kind: 'player', label: 'Nominee', options: ctx.seated.filter((x) => x !== ctx.holder) }],
          preview: true,
          order: 90,
          clearable: true,
          recorded: done ? [done.target] : null,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      if (!values.length) {
        const outcome = takeBack(ctx, confirmedToday(ctx, ctx.state.nominated), 'Golem nomination');
        ctx.markUsed(false);
        ctx.setState({ nominated: null });
        return outcome;
      }
      const nominee = values[0] as PlayerId;
      const name = ctx.name(nominee);
      ctx.markUsed();
      if (ctx.impaired) ctx.malfunctionIfExternal('Golem ability impaired');
      const { outcome, confirmed } = confirmKill(ctx, nominee, () => {
        if (force === 'none') {
          if (ctx.impaired) return { summary: 'The Golem is drunk or poisoned: nothing happens.', effective: false };
          if (ctx.registers(nominee).type === 'demon')
            return { summary: `${name} is the Demon: nothing happens.`, effective: false };
          if (!ctx.isAlive(nominee)) return { summary: `${name} is already dead: nothing happens.`, effective: false };
        }
        return dayKill(ctx, nominee, 'ability_kill', force);
      });
      ctx.setState({ nominated: confirmed });
      return outcome;
    },
  },
});
