import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

interface State {
  verdict: { day: number; value: string } | null;
}

export const gossip = defineRole<State>({
  id: roleId('gossip'),
  name: 'Gossip',
  type: 'townsfolk',
  abilityText: 'Each day, you may make a public statement. Tonight, if it was true, a player dies.',
  reminder: 'On the Day tab, turn on "The statement was true" if it was.',
  night: { other: 210, note: 'Only if the statement was true' },
  initialState: () => ({ verdict: null }),
  ability: {
    wakes: (ctx) =>
      ctx.n >= 1 && ctx.peers.some((a) => a.state.verdict?.day === ctx.n && a.state.verdict.value === 'true'),
    dayActions(ctx) {
      if (!ctx.firstPeer) return [];
      const verdict = ctx.peers.find((a) => a.state.verdict?.day === ctx.n)?.state.verdict?.value;
      return [
        {
          action: 'statement',
          title: `Gossip (${ctx.name(ctx.holder)})`,
          prompt: 'Was their public statement true? If so, a player dies tonight.',
          preview: false,
          order: 10,
          control: 'toggle',
          // Off: false, or no statement at all. An older game's "none" shows as off.
          recorded: verdict ? [verdict === 'true' ? 'true' : 'false'] : null,
          default: ['false'],
          fields: [
            {
              kind: 'option',
              label: 'Statement',
              options: ['false', 'true'],
              labels: { false: 'Not true, or none', true: 'The statement was true' },
            },
          ],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      ctx.setState({ verdict: { day: ctx.n, value: values[0] as string } });
      return { summary: `Statement recorded: ${values[0]}.`, effective: true };
    },
    resolve(ctx) {
      ctx.outcome('statement was true');
      if (ctx.impaired) {
        ctx.outcome('impaired: no death');
        return;
      }
      const alive = ctx.alive;
      if (!alive.length) return;
      const pool = alive.filter((x) => x !== ctx.holder);
      const victim = ctx.decide({
        key: { kind: 'gossip_victim' },
        title: 'Gossip: who dies?',
        description: "The Gossip's statement was true. Recommended at random.",
        options: alive.map((x) => ({ id: x, label: ctx.name(x) })),
        default: ctx.rng('victim').pick(pool.length ? pool : alive),
      });
      ctx.attemptKill(victim, 'ability_kill');
    },
  },
});
