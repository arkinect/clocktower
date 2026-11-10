import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { handOverDemon } from './lib';

interface State {
  /** A Demon who died during the day while she could take over. She does at dusk, if it still holds then. */
  heir: { demon: PlayerId; aliveBefore: number } | null;
}

export const scarletWoman = defineRole<State>({
  id: roleId('scarlet_woman'),
  name: 'Scarlet Woman',
  type: 'minion',
  abilityText: "If there are 5 or more players alive & the Demon dies, you become the Demon. (Travellers don't count)",
  flags: { demonHeir: true },
  initialState: () => ({ heir: null }),
  ability: {
    onDeath(ctx, death) {
      if (!death.wasDemon || death.demonHandover || death.aliveBefore < 5) return;
      if (ctx.believed || ctx.ability.holder.kind !== 'player') return;
      const me = ctx.holder;
      if (me === death.playerId || !ctx.isAlive(me) || ctx.impaired) return;
      if (!ctx.run.markChosen(`heir:${death.playerId}`)) return;
      // By day nothing is asked: she takes over when the night starts (onDusk), unless that's undone by then.
      if (!ctx.inWalk) {
        ctx.setState({ heir: { demon: death.playerId, aliveBefore: death.aliveBefore } });
        return;
      }
      const yes = ctx.decide({
        key: { kind: 'scarlet_woman', subject: death.playerId },
        title: `Scarlet Woman ${ctx.name(me)} becomes the Demon?`,
        description: `${ctx.name(death.playerId)} (the Demon) died with ${death.aliveBefore} players alive.`,
        options: [
          { id: 'yes', label: 'Yes, she becomes the Demon' },
          { id: 'no', label: 'No' },
        ],
        default: 'yes',
      });
      if (yes !== 'yes') return;
      handOverDemon(ctx, me, death.playerId);
      ctx.outcome(`${ctx.name(me)} (Scarlet Woman) becomes the Demon`);
    },
    onDusk(ctx) {
      const heir = ctx.state.heir;
      if (!heir) return;
      ctx.setState({ heir: null });
      // A Demon revived before dusk, or a Scarlet Woman dead, drunk or poisoned by then, changes nothing.
      if (ctx.isAlive(heir.demon) || !ctx.isAlive(ctx.holder) || ctx.impaired) return;
      // Pending: the "You are now the …" notice goes out as the night opens, and she makes the Demon's choice.
      handOverDemon(ctx, ctx.holder, heir.demon, true);
    },
    checkGameEnd(ctx) {
      if (ctx.state.heir) ctx.suppressGameEnd('no_demon');
    },
  },
});
