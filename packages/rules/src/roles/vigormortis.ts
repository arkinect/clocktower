import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

const SCARLET_WOMAN = roleId('scarlet_woman');

export const vigormortis = defineRole({
  id: roleId('vigormortis'),
  name: 'Vigormortis',
  type: 'demon',
  abilityText:
    'Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbour. [-1 Outsider]',
  night: { other: 160 },
  setupRules: {
    excludes: [SCARLET_WOMAN],
    counts(c) {
      c[1] -= 1;
      c[0] += 1;
    },
  },
  ability: {
    // Ruling: a Demon who takes over keeps what the last one caused (docs/rulings.md, Vigormortis and Scarlet Woman).
    setup(ctx) {
      if (ctx.n < 0 || ctx.ability.origin.kind !== 'character') return;
      for (const old of ctx.peers) if (old.id !== ctx.ability.id) ctx.adoptConditions(old.id);
    },
    picker: (ctx) => choosePlayers('Vigormortis', 'Choose a player: they die.', 1, ctx.seated),
    warnings(ctx) {
      if (!ctx.inPlay.includes(SCARLET_WOMAN)) return [];
      return ['The Vigormortis and the Scarlet Woman are both in play. These two should not be in the same game.'];
    },
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      if (ctx.impaired) {
        ctx.outcome('impaired: no kill');
        return;
      }
      if (!ctx.attemptKill(t, 'demon_attack') || ctx.typeOf(t) !== 'minion') return;
      ctx.keepAbilityWhenDead(t);
      ctx.outcome(`${ctx.name(t)} (Minion) keeps their ability`);
      const towns = ctx.nearest(t, (p) => ctx.typeOf(p) === 'townsfolk');
      if (!towns.length) return;
      const victim = ctx.decide({
        key: { kind: 'vigormortis', subject: t },
        title: `Vigormortis: which Townsfolk neighbour of ${ctx.name(t)} is poisoned?`,
        description: 'Lasts while the Vigormortis is alive and sober.',
        options: towns.map((x) => ({ id: x, label: ctx.name(x) })),
        default: ctx.rng(`victim:${t}`).pick(towns),
      });
      ctx.addCondition(victim, 'poisoned', { until: 'while_source_works' });
      ctx.outcome(`${ctx.name(victim)} is poisoned by the Vigormortis`);
    },
  },
});
