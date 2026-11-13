import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { choosePlayers, confirmChoice, dayKill } from './lib';

const CURSE = 'Cursed';
const curseOn = (ctx: AbilityCtx<unknown>) => ctx.conditionsFrom('marker').filter((c) => c.name === CURSE);

interface Applied {
  day: number;
  target: PlayerId;
  /** Whether applying it killed them, so taking it back revives them. */
  died: boolean;
}

interface State {
  applied?: Applied[];
}

/** Curses applied today, which the Day tab shows switched on. */
const appliedToday = (ctx: AbilityCtx<State>) => (ctx.state.applied ?? []).filter((x) => x.day === ctx.n);

export const witch = defineRole<State>({
  id: roleId('witch'),
  name: 'Witch',
  type: 'minion',
  abilityText:
    'Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.',
  reminder: 'If the cursed player nominates, apply the curse in the Day panel.',
  night: { first: 80, other: 80, note: "Only while 4 or more players are alive (Travellers don't count)" },
  initialState: () => ({ applied: [] }),
  ability: {
    // Travellers don't count towards "if just 3 players live", as with the Mayor and the Scarlet Woman.
    wakes: (ctx) => ctx.aliveAtDuskIds.filter((id) => ctx.typeOf(id) !== 'traveller').length >= 4,
    picker: (ctx) => choosePlayers('Witch', 'Choose a player: if they nominate tomorrow, they die.', 1, ctx.seated),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      confirmChoice(ctx, t);
      if (ctx.aliveResidents.length <= 3) {
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
      const on = appliedToday(ctx).map((x) => x.target);
      const targets = [...new Set([...curseOn(ctx).map((c) => c.target), ...on])];
      if (!targets.length) return [];
      return [
        {
          action: 'apply_curse',
          title: `Witch (${ctx.name(ctx.holder)})`,
          prompt: 'If the cursed player nominated, press their name: they die. Press again to take it back.',
          preview: true,
          order: 70,
          control: 'toggle',
          recorded: on.length ? on : null,
          fields: [{ kind: 'player', label: 'Cursed', options: targets }],
        },
      ];
    },
    // A toggle: the second press on the same player takes it back, reviving them if it killed them.
    applyDayAction(ctx, _action, values, force) {
      const target = values[0] as PlayerId;
      const name = ctx.name(target);
      const done = appliedToday(ctx).find((x) => x.target === target);
      if (done) {
        if (done.died && !ctx.isAlive(target)) ctx.revive(target, 'the Witch curse was taken back');
        ctx.addCondition(target, 'marker', { until: 'dusk', name: CURSE });
        ctx.setState({ applied: (ctx.state.applied ?? []).filter((x) => x !== done) });
        return { summary: `Taken back: ${name} is cursed again${done.died ? ' and alive' : ''}.`, effective: true };
      }
      const wasAlive = ctx.isAlive(target);
      for (const c of curseOn(ctx)) if (c.target === target) ctx.removeCondition(c);
      const outcome = dayKill(ctx, target, 'witch', force);
      const died = wasAlive && !ctx.isAlive(target);
      ctx.setState({ applied: [...(ctx.state.applied ?? []), { day: ctx.n, target, died }] });
      return outcome;
    },
  },
});
