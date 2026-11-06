import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

export const innkeeper = defineRole({
  id: roleId('innkeeper'),
  name: 'Innkeeper',
  type: 'townsfolk',
  abilityText: "Each night*, choose 2 players: they can't die tonight, but 1 is drunk until dusk.",
  night: { other: 40 },
  flags: { interceptPriority: 20 },
  ability: {
    picker: (ctx) =>
      choosePlayers('Innkeeper', "Choose 2 players: they can't die tonight, but 1 is drunk until dusk.", 2, ctx.seated),
    resolve(ctx) {
      const ts = ctx.choice as PlayerId[];
      if (ts.length !== 2) return;
      if (ctx.impaired) {
        ctx.outcome('impaired: no protection');
        return;
      }
      for (const t of ts) ctx.addCondition(t, 'protected', { until: 'dusk' });
      const drunk = ctx.decide({
        key: { kind: 'innkeeper' },
        title: `Innkeeper ${ctx.name(ctx.holder)}: who is drunk?`,
        description: `Protected: ${ts.map(ctx.name).join(' and ')}.`,
        options: ts.map((t) => ({ id: t, label: ctx.name(t) })),
        default: ctx.rng('pick').pick(ts),
      });
      ctx.addCondition(drunk, 'drunk', { until: 'dusk' });
      ctx.outcome(`${ts.map(ctx.name).join(' and ')} protected; ${ctx.name(drunk)} drunk until dusk`);
    },
    interceptKill(ctx, kill) {
      // "Tonight": a day kill passes.
      if (kill.unstoppable || !ctx.isNight) return 'pass';
      if (!ctx.conditionsFrom('protected').some((c) => c.target === kill.target)) return 'pass';
      ctx.outcome(`${ctx.name(kill.target)} survives: protected by the Innkeeper`);
      return 'prevent';
    },
  },
});
