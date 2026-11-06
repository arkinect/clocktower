import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

interface State {
  kills: PlayerId[];
}

export const shabaloth = defineRole<State>({
  id: roleId('shabaloth'),
  name: 'Shabaloth',
  type: 'demon',
  abilityText: 'Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated.',
  night: { other: 130 },
  initialState: () => ({ kills: [] }),
  ability: {
    picker: (ctx) => choosePlayers('Shabaloth', 'Choose 2 players: they die.', 2, ctx.seated),
    resolve(ctx) {
      if (ctx.impaired) {
        ctx.outcome('impaired: no kills, no regurgitation');
        return;
      }
      // A Demon that takes over keeps the memory: the list belongs to every Shabaloth there has been.
      const known = [...new Set(ctx.peers.flatMap((a) => a.state.kills))];
      const list = known.filter((x) => ctx.has(x) && !ctx.isAlive(x));
      if (list.length) {
        const rng = ctx.rng('roll');
        const roll = rng.int(3) === 0;
        const chosen = ctx.decide<string>({
          key: { kind: 'shabaloth' },
          title: 'Shabaloth: regurgitate a past victim?',
          description: `1-in-3 roll ${roll ? 'succeeded' : 'failed'}.`,
          options: [{ id: 'none', label: 'Nobody' }, ...list.map((x) => ({ id: x, label: ctx.name(x) }))],
          default: roll ? rng.pick(list) : 'none',
        });
        const back = list.find((x) => x === chosen);
        if (back) ctx.revive(back, 'regurgitated by the Shabaloth');
      }
      for (const t of ctx.choice as PlayerId[]) {
        if (ctx.attemptKill(t, 'demon_attack') && !ctx.state.kills.includes(t)) {
          ctx.setState({ kills: [...ctx.state.kills, t] });
        }
      }
    },
    onRevive(ctx, id) {
      for (const a of ctx.peers) a.state = { kills: a.state.kills.filter((x) => x !== id) };
    },
  },
});
