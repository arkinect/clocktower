import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers, confirmChoice } from './lib';

const DAMSEL = roleId('damsel');

export const huntsman = defineRole({
  id: roleId('huntsman'),
  name: 'Huntsman',
  type: 'townsfolk',
  abilityText:
    'Once per game, at night, choose a living player: the Damsel, if chosen, becomes a not-in-play Townsfolk. [+the Damsel]',
  night: { first: 110, other: 230 },
  flags: { oncePerGame: 'auto' },
  setupRules: { requires: [DAMSEL] },
  ability: {
    wakes: (ctx) => !ctx.ability.used,
    picker: (ctx) =>
      choosePlayers(
        'Huntsman',
        'Once per game: choose a player. The Damsel, if chosen, becomes a not-in-play Townsfolk.',
        1,
        ctx.alive,
        {
          decline: 'Not tonight',
        },
      ),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      ctx.markUsed();
      confirmChoice(ctx, t);
      if (ctx.impaired) {
        ctx.outcome('impaired: no effect, use spent');
        return;
      }
      if (ctx.character(t) !== DAMSEL) {
        ctx.outcome(`${ctx.name(t)} is not the Damsel: nothing happens`);
        return;
      }
      const taken: (RoleId | undefined | null)[] = [...ctx.inPlay, ...ctx.believedInPlay];
      const cands = ctx.scriptOfType('townsfolk').filter((r) => !taken.includes(r));
      if (!cands.length) {
        ctx.outcome('WARNING: no Townsfolk left out of play, the Damsel stays the Damsel');
        return;
      }
      const next = ctx.decide({
        key: { kind: 'huntsman_new_role' },
        title: `Huntsman found the Damsel (${ctx.name(t)}): she becomes…`,
        description: 'A Townsfolk not in play. Her new ability works from the next night.',
        options: cands.map((r) => ({ id: r, label: ctx.roleName(r) })),
        default: ctx.rng('role').pick(cands),
      });
      ctx.changeCharacter(t, next, {
        reason: 'Huntsman found the Damsel',
        alignment: 'natural',
        keepGranted: true,
        keepTies: true,
        startInfo: true,
        noActTonight: true,
      });
      ctx.notify(t, `Your role is now ${ctx.roleName(next)}`, [ctx.role(next).abilityText]);
      ctx.outcome(`the Damsel (${ctx.name(t)}) becomes the ${ctx.roleName(next)}`);
    },
  },
});
