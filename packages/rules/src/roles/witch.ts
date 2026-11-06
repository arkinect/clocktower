import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { choosePlayers, confirmChoice, dayKill } from './lib';

const CURSE = 'Cursed';
const curseOn = (ctx: AbilityCtx<unknown>) => ctx.conditionsFrom('marker').filter((c) => c.name === CURSE);

export const witch = defineRole({
  id: roleId('witch'),
  name: 'Witch',
  type: 'minion',
  abilityText:
    'Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.',
  reminder: 'If the cursed player nominates, apply the curse in the Day panel.',
  night: { first: 80, other: 80, note: 'Only while 4 or more players are alive' },
  ability: {
    wakes: (ctx) => ctx.aliveAtDuskIds.length >= 4,
    picker: (ctx) => choosePlayers('Witch', 'Choose a player: if they nominate tomorrow, they die.', 1, ctx.seated),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      confirmChoice(ctx, t);
      if (ctx.alive.length <= 3) {
        ctx.outcome('3 or fewer players alive: the Witch has no ability');
        return;
      }
      if (ctx.impaired) {
        ctx.outcome('impaired: no curse');
        return;
      }
      ctx.addCondition(t, 'marker', { until: 'dusk', name: CURSE });
      ctx.outcome(`${ctx.name(t)} is cursed: dies if they nominate tomorrow`);
    },
    dayActions(ctx) {
      const cursed = curseOn(ctx);
      if (!cursed.length) return [];
      return [
        {
          action: 'apply_curse',
          title: 'Witch: apply the curse',
          prompt: 'The cursed player nominated.',
          fields: [{ kind: 'player', label: 'Cursed', options: cursed.map((c) => c.target) }],
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      const target = values[0] as PlayerId;
      for (const c of curseOn(ctx)) if (c.target === target) ctx.removeCondition(c);
      return dayKill(ctx, target, 'witch', force);
    },
    onDayEvent(ctx, e) {
      if (e.kind !== 'nomination' || !curseOn(ctx).some((c) => c.target === e.nominator)) return;
      ctx.prompt({
        kind: 'witch',
        subject: e.nominator,
        title: `${ctx.name(e.nominator)} nominated while cursed`,
        description: 'If they nominate tomorrow, they die.',
        options: [
          { id: 'yes', label: 'Apply the curse' },
          { id: 'no', label: 'No' },
        ],
      });
    },
    onPrompt(ctx, _kind, subject, option) {
      if (option !== 'yes' || !subject) return;
      for (const c of curseOn(ctx)) if (c.target === subject) ctx.removeCondition(c);
      ctx.attemptKill(subject as PlayerId, 'witch');
    },
  },
});
