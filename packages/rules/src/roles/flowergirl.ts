import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { yesNo } from './lib';

interface State {
  voted: { day: number; value: boolean } | null;
}

/** Today's answer, which belongs to every holder of the ability. */
const recordedToday = (ctx: AbilityCtx<State>) =>
  ctx.peers.find((a) => a.state.voted?.day === ctx.n)?.state.voted ?? null;

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
      const voted = recordedToday(ctx);
      return [
        {
          action: 'demon_voted',
          title: 'Flowergirl: did a Demon vote today?',
          prompt: 'Recorded for the Flowergirl tonight.',
          preview: false,
          recorded: voted ? [voted.value ? 'yes' : 'no'] : null,
          // A living holder learns it tonight. If it's left blank, that night's Review asks.
          neededTonight: ctx.peers.some((a) => a.holder.kind === 'player' && ctx.isAlive(a.holder.id)),
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
      const recorded = recordedToday(ctx);
      // Not recorded during the day: the Storyteller must answer it before dawn (or force).
      const voted = recorded
        ? recorded.value
        : ctx.decide({
            key: { kind: 'flowergirl_voted', ability: null },
            title: `Flowergirl: did a Demon vote on Day ${ctx.n}?`,
            description: 'Not recorded during the day.',
            options: [
              { id: 'yes', label: 'Yes' },
              { id: 'no', label: 'No' },
            ],
            default: 'no',
            required: true,
          }) === 'yes';
      const fmt = (v: boolean) => [`${yesNo(v)}, a Demon ${v ? 'voted' : 'did not vote'} today.`];
      ctx.inform({ truth: fmt(voted), falseLines: fmt(!voted), alternatives: [fmt(true), fmt(false)] });
    },
  },
});
