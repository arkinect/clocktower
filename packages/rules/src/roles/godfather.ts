import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { Reader } from '../derive/reader';
import type { AbilityCtx } from '../night/context';
import { modifiedCounts } from '../setup/rules';
import { choosePlayers } from './lib';

const GODFATHER = roleId('godfather');
const TRIGGER = { kind: 'godfather_trigger' };

/** Whether an Outsider is left to remove, after the other setup modifiers. */
const removable = (r: Reader) => modifiedCounts(r.w, r.seated.length, r.inPlay, false)[1] > 0;

const outsiderDiedToday = (ctx: AbilityCtx<unknown>) =>
  ctx.n >= 1 &&
  ctx.seated.some((id) => {
    const at = ctx.player(id).life.diedAt;
    return !ctx.isAlive(id) && at?.kind === 'day' && at.n === ctx.n && ctx.typeOf(id) === 'outsider';
  });

function triggered(ctx: AbilityCtx<unknown>): boolean {
  const c = ctx.recorded(TRIGGER);
  if (c === 'yes') return ctx.n >= 1;
  return c === 'no' ? false : outsiderDiedToday(ctx);
}

export const godfather = defineRole({
  id: GODFATHER,
  name: 'Godfather',
  type: 'minion',
  abilityText:
    'You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [-1 or +1 Outsider]',
  night: { first: 50, other: 200, note: 'Only if an Outsider died today' },
  setupRules: {
    late: true,
    counts(c, q) {
      if (!q.roles.includes(GODFATHER)) return;
      const d = q.field(GODFATHER, 'outsiders') === '-1' && c[1] > 0 ? -1 : 1;
      c[1] += d;
      c[0] -= d;
    },
  },
  setupFields: [
    {
      field: 'outsiders',
      title: 'Godfather: Outsiders -1 or +1',
      kind: 'option',
      options: (r) => [
        { id: '+1', label: '+1 Outsider' },
        ...(removable(r) ? [{ id: '-1', label: '-1 Outsider' }] : []),
      ],
      validate(r, value) {
        if (value !== '-1' || removable(r)) return null;
        return 'There are no Outsiders to remove (after the other setup modifiers), so only +1 is possible.';
      },
      // A -1 chosen when there was an Outsider to remove counts as +1 once there is none.
      shown: (r, value) => (value === '-1' && !removable(r) ? '+1' : value),
    },
  ],
  ability: {
    checklist(ctx) {
      const field = ctx.field('outsiders');
      const chosen = field === '-1' && !removable(ctx) ? '+1' : field;
      return [
        {
          id: 'godfather',
          label: `Godfather: Outsiders -1 or +1${chosen ? ` (chosen: ${chosen})` : ''}`,
          done: chosen !== null,
          blocking: true,
        },
      ];
    },
    nightStart(ctx) {
      if (ctx.n < 1 || !ctx.canAct) return;
      const derived = outsiderDiedToday(ctx);
      ctx.decide({
        key: TRIGGER,
        title: 'Godfather may kill tonight?',
        description: derived ? 'An Outsider died during the day.' : 'No Outsider died during the day.',
        options: [
          { id: 'yes', label: 'Yes, the Godfather kills' },
          { id: 'no', label: 'No' },
        ],
        default: derived ? 'yes' : 'no',
      });
    },
    wakes: (ctx) => ctx.n === 0 || triggered(ctx),
    picker: (ctx) =>
      ctx.n === 0
        ? null
        : choosePlayers('Godfather', 'An Outsider died today: choose a player. They die.', 1, ctx.seated),
    resolve(ctx) {
      if (ctx.n === 0) {
        const outsiders = ctx.seated.filter((x) => ctx.typeOf(x) === 'outsider');
        const listed = outsiders
          .filter((x) => {
            const def = ctx.role(ctx.character(x) as typeof GODFATHER);
            if (!def.ability.registersAs) return true;
            const list = ctx.decide({
              key: { kind: 'godfather_recluse', subject: x },
              title: `Godfather: list the ${def.name} (${ctx.name(x)})?`,
              description: `The ${def.name} might not register as an Outsider.`,
              options: [
                { id: 'list', label: 'List it' },
                { id: 'hide', label: 'Hide it' },
              ],
              default: 'list',
            });
            if (list === 'hide' && !ctx.isImpaired(x)) {
              ctx.malfunction(ctx.holder, 'recluse', `${ctx.name(x)} (${def.name}) hidden from the Godfather`);
            }
            return list === 'list';
          })
          .map((x) => ctx.character(x) as typeof GODFATHER);
        const fmt = (roles: string[]) => [
          roles.length ? `Outsiders in play: ${roles.map(ctx.roleName).join(', ')}` : 'No Outsiders in play.',
        ];
        const spare = ctx.scriptOfType('outsider').filter((r) => !ctx.inPlay.includes(r));
        const rng = ctx.rng('false');
        let fake = listed.slice();
        if (spare.length) {
          if (fake.length) fake[rng.int(fake.length)] = rng.pick(spare);
          else fake = [rng.pick(spare)];
        }
        ctx.inform({ truth: fmt(listed), falseLines: fmt(fake) });
        return;
      }
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      if (ctx.impaired) ctx.outcome('impaired: no kill');
      else ctx.attemptKill(t, 'ability_kill');
    },
  },
});
