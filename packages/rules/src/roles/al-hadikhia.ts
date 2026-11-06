import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { choosePlayers } from './lib';

/** The question to one chosen player, who sees only the picks up to them. Returns their answer once given. */
export function liveOrDie(ctx: AbilityCtx<unknown>, t: PlayerId, ts: PlayerId[]): string | null {
  const before = ts.slice(0, ts.indexOf(t)).map(ctx.name);
  const chosen = before.length ? `${before.join(', ')}, then you` : 'you';
  const answer = ctx.ask({
    key: t,
    to: t,
    asksOther: true,
    spec: {
      title: 'Al-Hadikhia',
      prompt: `The Al-Hadikhia chose ${chosen}. Do you choose to live or die?`,
      fields: [
        { kind: 'option', label: 'Your choice', options: ['live', 'die'], labels: { live: 'Live', die: 'Die' } },
      ],
    },
  });
  return answer?.[0] ?? null;
}

/** All players learn who was chosen. */
export function announce(ctx: AbilityCtx<unknown>, ts: PlayerId[]) {
  const [x, y, z] = ts.map(ctx.name);
  for (const id of ctx.seated) ctx.notify(id, 'Al-Hadikhia', [`The Al-Hadikhia chose ${x}, ${y} and ${z}.`]);
}

export const alHadikhia = defineRole({
  id: roleId('al_hadikhia'),
  name: 'Al-Hadikhia',
  type: 'demon',
  abilityText:
    'Each night*, you may choose 3 players (all players learn who): each silently chooses to live or die, but if all live, all die.',
  night: { other: 170, note: 'The 3 chosen players each choose to live or die' },
  ability: {
    wakesDead: (ctx) => ctx.jinx('wakesDead'),
    picker: (ctx) =>
      ctx.jinx('replacePicker') ??
      choosePlayers(
        'Al-Hadikhia',
        'You may choose 3 players (all players learn who): each chooses to live or die, but if all live, all die.',
        3,
        ctx.seated,
        { decline: 'No one' },
      ),
    resolve(ctx) {
      const ts = ctx.choice as PlayerId[];
      if (ts.length !== 3) {
        ctx.outcome('chose no one: nothing happens');
        return;
      }
      announce(ctx, ts);
      const works = !ctx.believed && !ctx.impaired;
      if (!works) {
        ctx.outcome(
          `${ctx.believed ? 'not really the Al-Hadikhia' : 'impaired'}: questions asked, the answers have no effect`,
        );
      }
      let answers = 0;
      for (const t of ts) {
        const answer = liveOrDie(ctx, t, ts);
        if (!answer) {
          ctx.outcome(`${ctx.name(t)} has not answered: no effect for them`);
          continue;
        }
        answers += 1;
        ctx.outcome(`${ctx.name(t)} chose to ${answer}`);
        if (!works) continue;
        if (answer === 'die') ctx.attemptKill(t, 'demon_attack');
        else ctx.revive(t, 'chose to live');
      }
      if (!works) return;
      if (answers < 3) {
        ctx.outcome('the "if all live, all die" rule needs all three answers');
        return;
      }
      if (!ts.every(ctx.isAlive)) return;
      ctx.outcome('all three are alive: all three die');
      for (const t of ts) ctx.attemptKill(t, 'demon_attack');
    },
  },
});
