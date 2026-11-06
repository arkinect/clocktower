import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { handOverDemon } from './lib';

export const scarletWoman = defineRole({
  id: roleId('scarlet_woman'),
  name: 'Scarlet Woman',
  type: 'minion',
  abilityText: "If there are 5 or more players alive & the Demon dies, you become the Demon. (Travellers don't count)",
  flags: { demonHeir: true },
  ability: {
    onDeath(ctx, death) {
      if (!death.wasDemon || death.demonHandover || death.aliveBefore < 5) return;
      if (ctx.believed || ctx.ability.holder.kind !== 'player') return;
      const me = ctx.holder;
      if (me === death.playerId || !ctx.isAlive(me) || ctx.impaired) return;
      if (!ctx.run.markChosen(`heir:${death.playerId}`)) return;
      const title = `Scarlet Woman ${ctx.name(me)} becomes the Demon?`;
      const description = `${ctx.name(death.playerId)} (the Demon) died with ${death.aliveBefore} players alive.`;
      const options = [
        { id: 'yes', label: 'Yes, she becomes the Demon' },
        { id: 'no', label: 'No' },
      ];
      if (!ctx.inWalk) {
        ctx.prompt({ kind: 'scarlet_woman', subject: death.playerId, title, description, options });
        return;
      }
      const yes = ctx.decide({
        key: { kind: 'scarlet_woman', subject: death.playerId },
        title,
        description,
        options,
        default: 'yes',
      });
      if (yes !== 'yes') return;
      handOverDemon(ctx, me, death.playerId);
      ctx.outcome(`${ctx.name(me)} (Scarlet Woman) becomes the Demon`);
    },
    onPrompt(ctx, _kind, subject, option) {
      if (option === 'yes' && subject) handOverDemon(ctx, ctx.holder, subject as PlayerId, true);
    },
    checkGameEnd(ctx) {
      if (ctx.w.prompts.some((p) => p.ability === ctx.ability.id)) ctx.suppressGameEnd('no_demon');
    },
  },
});
