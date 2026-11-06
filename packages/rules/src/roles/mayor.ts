import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const mayor = defineRole({
  id: roleId('mayor'),
  name: 'Mayor',
  type: 'townsfolk',
  abilityText:
    'If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.',
  reminder: 'A 3-player win is suggested when no execution is recorded.',
  flags: { dayReminder: true, interceptPriority: 60, passive: true },
  ability: {
    // Unstoppable kills still pass here: the bounce doesn't stop a death, it moves it.
    interceptKill(ctx, kill) {
      if (ctx.ability.holder.kind !== 'player') return 'pass';
      const me = ctx.holder;
      const byOther = kill.attacker !== null && kill.attacker !== me;
      if (!ctx.isNight || kill.target !== me || kill.redirected || !byOther || ctx.believed) return 'pass';
      if (ctx.impaired) {
        ctx.malfunctionIfExternal('Mayor bounce failed');
        return 'pass';
      }
      const name = ctx.name(me);
      const rng = ctx.rng(`bounce:${kill.attackerAbility}:${kill.cause}`);
      const heads = rng.coin();
      const pool = ctx.alive.filter((x) => x !== me && x !== kill.attacker);
      const bounce = !heads && pool.length ? rng.pick(pool) : null;
      const chosen = ctx.decide<string>({
        key: { kind: 'mayor', detail: `${kill.attackerAbility}:${kill.cause}` },
        title: `Mayor ${name} is attacked`,
        description: `Coin: ${heads ? 'heads, the Mayor dies' : `tails, redirect to ${ctx.name(bounce)}`}. Redirects still go through protections.`,
        options: [
          { id: 'die', label: `${name} (Mayor) dies` },
          { id: 'none', label: 'Nobody dies' },
          ...ctx.alive.filter((x) => x !== me).map((x) => ({ id: x, label: `Attack ${ctx.name(x)} instead` })),
        ],
        default: bounce ?? 'die',
      });
      if (chosen === 'die') return 'pass';
      if (chosen === 'none') {
        ctx.outcome(`Mayor ${name} attacked: nobody dies (Storyteller's choice)`);
        return 'prevent';
      }
      ctx.outcome(`Mayor ${name} attacked: death redirected to ${ctx.name(chosen)}`);
      return { redirect: chosen as PlayerId };
    },
    onDayEvent(ctx, e) {
      if (e.kind !== 'execution' || e.playerId !== null || ctx.ability.holder.kind !== 'player') return;
      if (ctx.isAlive(ctx.holder) && !ctx.impaired && ctx.aliveResidents.length === 3) {
        ctx.suggestGameEnd('mayor', ctx.alignmentOf(ctx.holder), 'Only 3 players live and no execution occurred.');
      }
    },
  },
});
