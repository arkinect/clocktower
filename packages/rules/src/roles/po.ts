import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

interface State {
  lastChoiceNone: boolean;
}

export const po = defineRole<State>({
  id: roleId('po'),
  name: 'Po',
  type: 'demon',
  abilityText:
    'Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight.',
  night: { other: 140 },
  initialState: () => ({ lastChoiceNone: false }),
  ability: {
    picker(ctx) {
      const opts = ctx.seated;
      if (ctx.state.lastChoiceNone) {
        return choosePlayers(
          'Po',
          'Your last choice was no-one: choose 3 players. They die.',
          Math.min(3, opts.length),
          opts,
        );
      }
      return choosePlayers(
        'Po',
        'You may choose a player: they die. If you choose no-one, choose 3 players next night.',
        1,
        opts,
        {
          decline: 'No one',
        },
      );
    },
    resolve(ctx) {
      const ts = ctx.choice as PlayerId[];
      ctx.setState({ lastChoiceNone: ts.length === 0 });
      if (ctx.impaired) {
        ctx.outcome('impaired: no kills');
        return;
      }
      if (!ts.length) ctx.outcome('chose no one');
      for (const t of ts) ctx.attemptKill(t, 'demon_attack');
    },
  },
});
