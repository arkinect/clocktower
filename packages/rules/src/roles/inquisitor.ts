// Homebrew: not an official character. Built as the Golem, with the test turned round to the nominee's alignment.
import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { confirmKill, confirmedToday, dayKill, takeBack, type Confirmed } from './lib';

interface State {
  /** Today's nomination, until the day ends: a second Use takes it back. */
  nominated?: Confirmed | null;
}

function nominate(ctx: AbilityCtx<State>, nominee: PlayerId, force: 'none' | 'success' | 'fail') {
  const name = ctx.name(nominee);
  ctx.markUsed();
  if (ctx.impaired) ctx.malfunctionIfExternal('Inquisitor ability impaired');
  const { outcome, confirmed } = confirmKill(ctx, nominee, () => {
    if (force === 'none') {
      if (ctx.impaired) return { summary: 'The Inquisitor is drunk or poisoned: nothing happens.', effective: false };
      if (ctx.registers(nominee, 'alignment').alignment !== 'good')
        return { summary: `${name} is evil: nothing happens.`, effective: false };
      if (!ctx.isAlive(nominee)) return { summary: `${name} is already dead: nothing happens.`, effective: false };
    }
    return dayKill(ctx, nominee, 'ability_kill', force);
  });
  ctx.setState({ nominated: confirmed });
  return outcome;
}

export const inquisitor = defineRole<State>({
  id: roleId('inquisitor'),
  name: 'Inquisitor',
  type: 'outsider',
  autoplay: { reminder: 'You may only nominate once this game. Nobody will stop you: keep to it yourself.' },
  homebrew: true,
  abilityText: 'You may nominate once per game. When you do, if the nominee is good, they die.',
  reminder: "Day ability. Use the Inquisitor's day action when they nominate.",
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
          title: `Inquisitor (${ctx.name(ctx.holder)})`,
          prompt: 'Who did they nominate?',
          fields: [{ kind: 'player', label: 'Nominee', options: ctx.seated.filter((x) => x !== ctx.holder) }],
          preview: true,
          order: 91,
          clearable: true,
          recorded: done ? [done.target] : null,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      if (!values.length) {
        const outcome = takeBack(ctx, confirmedToday(ctx, ctx.state.nominated), 'Inquisitor nomination');
        ctx.markUsed(false);
        ctx.setState({ nominated: null });
        return outcome;
      }
      return nominate(ctx, values[0] as PlayerId, force);
    },
    onNomination(ctx, { nominator, nominee }) {
      if (nominator === ctx.holder && ctx.isAlive(ctx.holder) && !ctx.ability.used) nominate(ctx, nominee, 'none');
    },
  },
});
