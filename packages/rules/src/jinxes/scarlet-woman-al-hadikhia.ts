import { roleId } from '@ct/protocol';
import { defineJinx } from './define';
import { DJINN } from './lib';

const SCARLET_WOMAN = roleId('scarlet_woman');
const AL_HADIKHIA = roleId('al_hadikhia');
const LABEL = 'Jinx (Scarlet Woman & Al-Hadikhia)';

export const scarletWomanAlHadikhia = defineJinx({
  a: SCARLET_WOMAN,
  b: AL_HADIKHIA,
  text: 'If there would be two Demons, one of which was the Scarlet Woman, the Scarlet Woman becomes the Scarlet Woman again.',
  handling: 'engine',
  source: DJINN,
  hooks: {
    afterRevive(ctx) {
      const demons = ctx.alive.filter(ctx.isDemon);
      const was = demons.find((id) =>
        ctx
          .player(id)
          .history.some((h) => h.kind === 'character' && h.from === SCARLET_WOMAN && h.to === ctx.character(id)),
      );
      if (!was || !demons.some((id) => id !== was && ctx.character(id) === AL_HADIKHIA)) return null;
      ctx.changeCharacter(was, SCARLET_WOMAN, {
        reason: 'a second Demon came back',
        alignment: 'natural',
        keepGranted: true,
        keepTies: true,
        noActTonight: true,
      });
      ctx.notify(was, `${LABEL}: You are the Scarlet Woman again`, [ctx.role(SCARLET_WOMAN).abilityText]);
      ctx.outcome(`${LABEL}: ${ctx.name(was)} is the Scarlet Woman again`);
      return was;
    },
  },
});
