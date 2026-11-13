import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { confirmKill, confirmedToday, dayKill, takeBack, type Confirmed } from './lib';

interface State {
  /** The day they last chose a player. */
  day: number | null;
  /** Today's choice, until the day ends: a second Use takes it back. */
  chose?: Confirmed | null;
}

export const psychopath = defineRole<State>({
  id: roleId('psychopath'),
  name: 'Psychopath',
  type: 'minion',
  abilityText:
    'Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose roshambo.',
  initialState: () => ({ day: null, chose: null }),
  ability: {
    dayActions(ctx) {
      const chose = confirmedToday(ctx, ctx.state.chose);
      if (ctx.ability.holder.kind !== 'player') return [];
      if (!chose && (!ctx.isAlive(ctx.holder) || ctx.state.day === ctx.n)) return [];
      // The one they chose stays listed once dead, so the Day tab can show the choice.
      const options = chose && !ctx.alive.includes(chose.target) ? [...ctx.alive, chose.target] : ctx.alive;
      return [
        {
          action: 'kill',
          title: `Psychopath (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they choose?',
          fields: [{ kind: 'player', label: 'Chosen', options }],
          preview: true,
          order: 40,
          clearable: true,
          recorded: chose ? [chose.target] : null,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      if (!values.length) {
        const outcome = takeBack(ctx, confirmedToday(ctx, ctx.state.chose), 'Psychopath choice');
        ctx.setState({ day: null, chose: null });
        return outcome;
      }
      const target = values[0] as PlayerId;
      if (ctx.impaired) ctx.malfunctionIfExternal('Psychopath ability impaired');
      const { outcome, confirmed } = confirmKill(ctx, target, () => {
        if (force === 'none' && ctx.impaired) {
          return { summary: 'The Psychopath is drunk or poisoned: nothing happens.', effective: false };
        }
        // Through the protections (the Tea Lady, the Fool), unlike a death marked by hand.
        return dayKill(ctx, target, 'ability_kill', force);
      });
      ctx.setState({ day: ctx.n, chose: confirmed });
      return outcome;
    },
  },
});
