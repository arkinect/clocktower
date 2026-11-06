import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const mathematician = defineRole({
  id: roleId('mathematician'),
  name: 'Mathematician',
  type: 'townsfolk',
  abilityText:
    "Each night, you learn how many players' abilities worked abnormally (since dawn) due to another character's ability.",
  night: { first: 200, other: 370 },
  ability: {
    resolve(ctx) {
      ctx.jinx('beforeMalfunctionCount');
      const truth = ctx.malfunctionsSinceDawn().size;
      // What the false count may plausibly be: other players with an ability that can go wrong.
      const capN = ctx.seated.filter((id) => {
        if (id === ctx.holder) return false;
        const r = ctx.character(id);
        if (!r) return false;
        const def = ctx.role(r);
        if (def.believes) {
          const told = ctx.w.setup.bag[id];
          return !!told && !!ctx.role(told).ability.resolve;
        }
        return !!def.flags.passive || !!def.ability.resolve;
      }).length;
      const fmt = (n: number) => [`${n} player${n === 1 ? "'s ability" : "s' abilities"} worked abnormally.`];
      const others: number[] = [];
      for (let i = 0; i <= capN; i++) if (i !== truth) others.push(i);
      const fake = capN === 0 || !others.length ? (capN === 0 ? 0 : truth) : ctx.rng('number').pick(others);
      const alternatives: string[][] = [];
      for (let i = 0; i <= Math.max(capN, truth); i++) alternatives.push(fmt(i));
      ctx.inform({ truth: fmt(truth), falseLines: fmt(fake), alternatives });
    },
  },
});
