import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { dayKill } from './lib';

interface State {
  /** The day they last chose a player. */
  day: number | null;
}

export const psychopath = defineRole<State>({
  id: roleId('psychopath'),
  name: 'Psychopath',
  type: 'minion',
  abilityText:
    'Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose roshambo.',
  reminder:
    'Day ability. If executed, they only die if they lose roshambo: if they win, revive them in the Grimoire before Start Night.',
  flags: { dayReminder: true },
  initialState: () => ({ day: null }),
  ability: {
    dayActions(ctx) {
      if (ctx.ability.holder.kind !== 'player' || !ctx.isAlive(ctx.holder) || ctx.state.day === ctx.n) return [];
      return [
        {
          action: 'kill',
          title: `Psychopath (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they choose? They die.',
          fields: [{ kind: 'player', label: 'Chosen', options: ctx.alive }],
          preview: true,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      const target = values[0] as PlayerId;
      ctx.setState({ day: ctx.n });
      if (ctx.impaired) ctx.malfunctionIfExternal('Psychopath ability impaired');
      if (force === 'none' && ctx.impaired) {
        return { summary: 'The Psychopath is drunk or poisoned: nothing happens.', effective: false };
      }
      // Through the protections (the Tea Lady, the Fool), unlike a death marked by hand.
      return dayKill(ctx, target, 'ability_kill', force);
    },
  },
});
