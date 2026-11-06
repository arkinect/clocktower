import { roleId, type PlayerId } from '@ct/protocol';
import type { AbilityCtx } from '../night/context';
import { choosePlayers } from '../roles/lib';
import { announce, liveOrDie } from '../roles/al-hadikhia';
import { defineJinx } from './define';
import { DJINN } from './lib';

const AL_HADIKHIA = roleId('al_hadikhia');
const MASTERMIND = roleId('mastermind');
const LABEL = 'Jinx (Al-Hadikhia & Mastermind)';

/** The night after the Al-Hadikhia died by execution, with a living Mastermind and no other living Demon. */
function tonight(ctx: AbilityCtx<unknown>): boolean {
  const me = ctx.holder;
  const life = ctx.player(me).life;
  return (
    !life.alive &&
    ctx.character(me) === AL_HADIKHIA &&
    life.cause === 'execution' &&
    life.diedAt?.kind === 'day' &&
    life.diedAt.n === ctx.n &&
    ctx.playersWith(MASTERMIND).some(ctx.isAlive) &&
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
      );
    },
    replaceResolve(ctx) {
      if (ctx.ability.roleId !== AL_HADIKHIA || !tonight(ctx)) return false;
      const ts = ctx.choice as PlayerId[];
      if (ts.length !== 3) {
        ctx.outcome(`${LABEL}: no 3 good players chosen, the Storyteller decides`);
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
      for (const m of ctx.playersWith(MASTERMIND)) {
        if (ctx.isAlive(m) && ctx.isImpaired(m))
          ctx.outcome(`${LABEL}: the Mastermind (${ctx.name(m)}) is drunk or poisoned`);
      }
      return true;
    },
  },
});
