import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { yesNo } from './lib';

interface State {
  voted: { day: number; value: boolean } | null;
}

export const flowergirl = defineRole<State>({
  id: roleId('flowergirl'),
  name: 'Flowergirl',
  type: 'townsfolk',
  abilityText: 'Each night*, you learn if a Demon voted today.',
  night: { other: 310 },
  initialState: () => ({ voted: null }),
  ability: {
    dayActions(ctx) {
      if (!ctx.firstPeer) return [];
      return [
        {
          action: 'demon_voted',
          title: 'Flowergirl: did a Demon vote today?',
          prompt: 'Recorded for the Flowergirl tonight.',
          preview: false,
          fields: [
            {
              kind: 'option',
              label: 'Demon voted',
              options: ['yes', 'no'],
              labels: { yes: 'Yes', no: 'No' },
            },
          ],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      ctx.setState({ voted: { day: ctx.n, value: values[0] === 'yes' } });
      return { summary: `Recorded: a Demon ${values[0] === 'yes' ? 'voted' : 'did not vote'} today.`, effective: true };
    },
    resolve(ctx) {
      const voted = ctx.peers.some((a) => a.state.voted?.day === ctx.n && a.state.voted.value);
      const fmt = (v: boolean) => [`${yesNo(v)}, a Demon ${v ? 'voted' : 'did not vote'} today.`];
      ctx.inform({ truth: fmt(voted), falseLines: fmt(!voted), alternatives: [fmt(true), fmt(false)] });
    },
  },
});
