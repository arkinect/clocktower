import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

interface State {
  grandchild: PlayerId | null;
}

export const grandmother = defineRole<State>({
  id: roleId('grandmother'),
  name: 'Grandmother',
  type: 'townsfolk',
  abilityText: 'You start knowing a good player & their character. If the Demon kills them, you die too.',
  night: { first: 190, other: 260, note: 'Only if the Demon killed the grandchild, or the ability was just gained' },
  flags: { startInfo: true },
  initialState: () => ({ grandchild: null }),
  ability: {
    wakes: () => true,
    resolve(ctx) {
      const me = ctx.holder;
      if (ctx.startInfoDue) {
        const others = ctx.seated.filter((x) => x !== me);
        if (!others.length) return;
        const fmt = (id: PlayerId, r: string | null) => [`Your grandchild is ${ctx.name(id)}, the ${ctx.roleName(r)}.`];
        if (ctx.impaired) {
          const rng = ctx.rng('false');
          ctx.setState({ grandchild: null });
          ctx.inform({
            truth: ['(impaired: no grandchild is recorded)'],
            falseLines: fmt(rng.pick(others), rng.pick(ctx.script)),
          });
          ctx.outcome('impaired: false grandchild, no link');
          return;
        }
        const goods = others.filter((x) => ctx.alignmentOf(x) === 'good');
        if (!goods.length) {
          ctx.inform({ truth: ['There is no good player to be your grandchild.'] });
          return;
        }
        const pool = goods.filter((x) => {
          const c = ctx.character(x);
          return !c || ctx.role(c).believes?.allowed === undefined || ctx.role(c).type !== 'outsider';
        });
        const child = ctx.decide({
          key: { kind: 'grandmother_grandchild' },
          title: `Grandmother ${ctx.name(me)}: who is the grandchild?`,
          description: 'Any good player. She learns their actual character.',
          options: goods.map((x) => ({ id: x, label: `${ctx.name(x)} (${ctx.roleName(ctx.character(x))})` })),
          default: ctx.rng('child').pick(pool.length ? pool : goods),
        });
        ctx.setState({ grandchild: child });
        ctx.outcome(`grandchild: ${ctx.name(child)}`);
        ctx.inform({ truth: fmt(child, ctx.character(child)) });
        return;
      }
      const child = ctx.state.grandchild;
      if (!child || ctx.deathCauseTonight(child) !== 'demon_attack' || !ctx.isAlive(me)) return;
      if (ctx.impaired) {
        ctx.malfunctionIfExternal('Grandmother link failed');
        ctx.outcome('grandchild killed by the Demon, but the Grandmother is impaired');
        return;
      }
      const dies = ctx.decide({
        key: { kind: 'grandmother_link' },
        title: `Grandmother ${ctx.name(me)} dies too?`,
        description: `${ctx.name(child)} (her grandchild) was killed by the Demon.`,
        options: [
          { id: 'yes', label: 'Yes, she dies too' },
          { id: 'no', label: 'No' },
        ],
        default: 'yes',
      });
      if (dies === 'yes') ctx.attemptKill(me, 'grandchild_link');
    },
  },
});
