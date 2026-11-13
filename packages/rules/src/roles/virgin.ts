import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

interface State {
  /**
   * Today's nomination, until the day ends: a second Use takes it back. `before`: the execution chosen before the
   * Virgin's, restored when an execution it made is taken back.
   */
  nominated?: {
    day: number;
    nominator: PlayerId;
    executed: boolean;
    before: { playerId: PlayerId | null; died: boolean } | null;
  } | null;
}

export const virgin = defineRole<State>({
  id: roleId('virgin'),
  name: 'Virgin',
  type: 'townsfolk',
  abilityText: 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.',
  reminder: "Day ability. Use the Virgin's day action when she is first nominated.",
  flags: { oncePerGame: 'auto' },
  initialState: () => ({ nominated: null }),
  ability: {
    dayActions(ctx) {
      const done = ctx.state.nominated?.day === ctx.n ? ctx.state.nominated : null;
      if ((ctx.ability.used && !done) || ctx.ability.holder.kind !== 'player') return [];
      return [
        {
          action: 'nominated',
          title: `Virgin (${ctx.name(ctx.holder)})`,
          prompt: 'Who first nominated them?',
          fields: [{ kind: 'player', label: 'Nominator', options: ctx.seated.filter((x) => x !== ctx.holder) }],
          preview: true,
          order: 80,
          clearable: true,
          recorded: done ? [done.nominator] : null,
        },
      ];
    },
    applyDayAction(ctx, _action, values, force) {
      if (!values.length) {
        const done = ctx.state.nominated?.day === ctx.n ? ctx.state.nominated : null;
        if (!done) return { summary: 'Nothing to take back.', effective: false };
        if (done.executed) ctx.execute(done.before?.playerId ?? null, done.before?.died ?? false);
        ctx.markUsed(false);
        ctx.setState({ nominated: null });
        return {
          summary: `Taken back${done.executed ? `: ${ctx.name(done.nominator)} is no longer executed` : ''}.`,
          effective: true,
        };
      }
      const nominator = values[0] as PlayerId;
      const name = ctx.name(nominator);
      const townsfolk = ctx.registers(nominator, 'character').type === 'townsfolk';
      const record = (executed: boolean, before: { playerId: PlayerId | null; died: boolean } | null = null) =>
        ctx.setState({ nominated: { day: ctx.n, nominator, executed, before } });
      ctx.markUsed();
      if (ctx.impaired) ctx.malfunctionIfExternal('Virgin ability impaired');
      record(false);
      if (force === 'fail') return { summary: `${name} is not executed (forced).`, effective: false };
      if (force === 'none') {
        if (ctx.impaired) return { summary: 'The Virgin is drunk or poisoned: nothing happens.', effective: false };
        if (!townsfolk) return { summary: `${name} is not a Townsfolk: nothing happens.`, effective: false };
      }
      // Today's execution, which happens at dusk like any other.
      record(true, ctx.executionChoiceToday);
      ctx.execute(nominator);
      return {
        summary: `${name} is executed as the night starts${force === 'success' ? ' (forced)' : ''}.`,
        effective: true,
      };
    },
  },
});
