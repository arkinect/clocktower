import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { character } from '../night/info';
import { choosePlayers } from './lib';

export const ravenkeeper = defineRole({
  id: roleId('ravenkeeper'),
  name: 'Ravenkeeper',
  type: 'townsfolk',
  autoplay: true,
  abilityText: 'If you die at night, you are woken to choose a player: you learn their character.',
  night: { other: 280, note: 'Only if killed tonight' },
  flags: { worksWhileDead: true, wakesOnNightDeath: true, asksOnDeath: true },
  ability: {
    resolve(ctx) {
      const answer = ctx.ask({
        to: ctx.holder,
        spec: choosePlayers(
          'Ravenkeeper',
          'You have died. Choose a player: you learn their character.',
          1,
          ctx.seated,
          {
            distinct: false,
          },
        ),
      });
      if (!answer) {
        ctx.outcome("died tonight: waiting for the Ravenkeeper's choice");
        return;
      }
      const [t] = answer as PlayerId[];
      if (!t) return;
      const truth = ctx.registers(t, 'character').character;
      const others = ctx.script.filter((r) => r !== truth);
      const fake = others.length ? ctx.rng('role').pick(others) : truth;
      ctx.inform({
        truth: character(truth),
        fake: character(fake),
        lies: others.map((r) => character(r)),
        say: (a) => [`${ctx.name(t)} is the ${ctx.roleName(a.role)}.`],
      });
    },
  },
});
