import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { note, playerCharacter } from '../night/info';

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
        const say = (a: ReturnType<typeof playerCharacter>) => [
          `Your grandchild is ${ctx.name(a.player)}, the ${ctx.roleName(a.role)}.`,
        ];
        if (ctx.impaired) {
          const rng = ctx.rng('false');
          ctx.setState({ grandchild: null });
          const fakeChild = rng.pick(others);
          ctx.inform({
            truth: note(['(impaired: no grandchild is recorded)']),
            fake: playerCharacter(fakeChild, rng.pick(ctx.script)),
            say,
          });
          ctx.outcome('impaired: false grandchild, no link');
          return;
        }
        const goods = others.filter((x) => ctx.alignmentOf(x) === 'good');
        if (!goods.length) {
          ctx.tell(['There is no good player to be your grandchild.']);
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
        ctx.inform({ truth: playerCharacter(child, ctx.character(child)), say });
        return;
      }
      const child = ctx.state.grandchild;
      if (!child || ctx.deathCauseTonight(child) !== 'demon_attack' || !ctx.isAlive(me)) return;
      if (ctx.impaired) {
        ctx.malfunctionIfExternal('Grandmother link failed');
        ctx.outcome('grandchild killed by the Demon, but the Grandmother is impaired');
        return;
      }
      // Nothing to confirm: a sober Grandmother dies with a grandchild the Demon kills.
      ctx.attemptKill(me, 'grandchild_link');
    },
  },
});
