import { roleId, type PlayerId } from '@ct/protocol';
import type { AbilityCtx } from '../night/context';
import { choosePlayers } from '../roles/lib';
import { announce, liveOrDie } from '../roles/al-hadikhia';
import { extraDay } from '../roles/mastermind';
import { defineJinx } from './define';
import { DJINN } from './lib';

const AL_HADIKHIA = roleId('al_hadikhia');
const MASTERMIND = roleId('mastermind');
const LABEL = 'Jinx (Al-Hadikhia & Mastermind)';

/**
 * The night after the Al-Hadikhia died by execution, with no other living Demon and a Mastermind who was alive, sober
 * and healthy at the execution. What happens to the Mastermind that night changes nothing.
 */
function tonight(ctx: AbilityCtx<unknown>): boolean {
  const me = ctx.holder;
  const life = ctx.player(me).life;
  return (
    !life.alive &&
    ctx.character(me) === AL_HADIKHIA &&
    life.cause === 'execution' &&
    life.diedAt?.kind === 'day' &&
    life.diedAt.n === ctx.n &&
    ctx.instances.some((a) => a.roleId === MASTERMIND && extraDay(a) === ctx.n + 1) &&
    !ctx.alive.some((id) => id !== me && ctx.isDemon(id))
  );
}

export const alHadikhiaMastermind = defineJinx({
  a: AL_HADIKHIA,
  b: MASTERMIND,
  text: 'If the Al-Hadikhia dies by execution, and the Mastermind is alive, the Al-Hadikhia chooses 3 good players tonight: if all 3 choose to live, evil wins. Otherwise, good wins.',
  handling: 'engine',
  source: DJINN,
  hooks: {
    wakesDead: tonight,
    replacePicker(ctx) {
      if (!tonight(ctx)) return null;
      const good = ctx.seated.filter((x) => ctx.alignmentOf(x) === 'good');
      return choosePlayers(
        'Al-Hadikhia',
        `${LABEL}: Choose 3 good players: if all 3 choose to live, evil wins. Otherwise, good wins.`,
        3,
        good,
        // Nothing else to do when they can't choose 3.
        good.length < 3 ? { decline: 'No one' } : {},
      );
    },
    replaceResolve(ctx) {
      if (ctx.ability.roleId !== AL_HADIKHIA || !tonight(ctx)) return false;
      const ts = ctx.choice as PlayerId[];
      if (ts.length !== 3) {
        ctx.outcome(`${LABEL}: 3 good players were not chosen, good wins. Apply this at the table.`);
        ctx.suggestGameEnd('al_hadikhia_mastermind', 'good', LABEL);
        return true;
      }
      announce(ctx, ts);
      // Nothing dies and the app doesn't end the game: the review says who wins, for the table.
      const answers = ts.map((t) => liveOrDie(ctx, t, ts));
      ts.forEach((t, i) => ctx.outcome(`${ctx.name(t)} ${answers[i] ? `chose to ${answers[i]}` : 'has not answered'}`));
      if (answers.every(Boolean)) {
        const evil = answers.every((x) => x === 'live');
        ctx.outcome(`${LABEL}: ${evil ? 'evil wins' : 'good wins'}. Apply this at the table.`);
        ctx.suggestGameEnd('al_hadikhia_mastermind', evil ? 'evil' : 'good', LABEL);
      } else {
        ctx.outcome(`${LABEL}: waiting for all three answers`);
      }
      return true;
    },
  },
});
