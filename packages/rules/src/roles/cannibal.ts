import { roleId, type AbilityId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { allRoles } from '../abilities/registry';
import type { AbilityCtx } from '../night/context';

interface State {
  ate: boolean;
  /** The executee was evil: anything set here gives false information. */
  fake: boolean;
  eaten: AbilityId | null;
  roleId: RoleId | null;
}

const CANNIBAL = roleId('cannibal');
const JINX = 'Jinx (Cannibal & ';

/** The one way what a Cannibal ate changes. The old ability goes, with whatever it gained. */
function setEaten(ctx: AbilityCtx<State>, role: RoleId | null, fake: boolean) {
  if (ctx.state.eaten) ctx.revoke(ctx.state.eaten);
  const me = ctx.holder;
  ctx.dropPending(me, JINX);
  const reveal = role !== null && ctx.jinx('onGain', role);
  const gained = role
    ? ctx.grant(me, role, {
        shownAs: reveal ? role : (ctx.ability.shownAs ?? ctx.ability.roleId),
        startInfo: true,
        perceivedOnly: fake || ctx.believed,
      })
    : null;
  ctx.setState({ ate: true, fake, eaten: gained?.id ?? null, roleId: role });
  if (reveal && role) {
    const def = ctx.role(role);
    ctx.notify(me, `${JINX}${def.name}): You have the ${def.name} ability`, [def.abilityText], { pending: true });
  }
}

export const cannibal = defineRole<State>({
  id: CANNIBAL,
  name: 'Cannibal',
  type: 'townsfolk',
  abilityText:
    'You have the ability of the recently killed executee. If they are evil, you are poisoned until a good player dies by execution.',
  reminder: 'Gains the ability when an execution kills someone. Check or change it in the Day panel.',
  initialState: () => ({ ate: false, fake: false, eaten: null, roleId: null }),
  ability: {
    onDayEvent(ctx, e) {
      if (e.kind !== 'execution' || !e.died || !e.playerId) return;
      if (ctx.ability.activeUntil === 'removed' || ctx.ability.holder.kind !== 'player') return;
      const me = ctx.holder;
      const executee = e.playerId;
      if (me === executee || !ctx.isAlive(me)) return;
      const good = ctx.alignmentOf(executee) === 'good';
      setEaten(ctx, good ? ctx.character(executee) : null, !good);
      // "Poisoned until a good player dies by execution": any earlier eat's poison ends here.
      for (const c of ctx.conditionsFrom('poisoned')) ctx.removeCondition(c);
      if (!good && !ctx.believed) ctx.addCondition(me, 'poisoned', { until: 'removed' });
    },
    dayActions(ctx) {
      if (!ctx.state.ate) return [];
      const roles = allRoles().filter(
        (r) => r.id !== CANNIBAL && ['townsfolk', 'outsider', 'minion', 'demon'].includes(r.type),
      );
      return [
        {
          action: 'set_ability',
          title: `Cannibal (${ctx.name(ctx.holder)}): eaten ability`,
          prompt: 'Which ability do they have?',
          preview: false,
          fields: [
            {
              kind: 'option',
              label: 'Ability',
              options: ['none', ...roles.map((r) => r.id)],
              labels: { none: 'No ability', ...Object.fromEntries(roles.map((r) => [r.id, r.name])) },
            },
          ],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const value = values[0] === 'none' ? null : (values[0] as RoleId);
      if (value !== ctx.state.roleId) setEaten(ctx, value, ctx.state.fake);
      return { summary: `The Cannibal now has: ${ctx.roleName(value)}.`, effective: true };
    },
    summary: (ctx) =>
      ctx.state.ate ? [`Ate: ${ctx.roleName(ctx.state.roleId)}${ctx.state.fake ? ' (false information)' : ''}`] : [],
  },
});

export type { PlayerId };
