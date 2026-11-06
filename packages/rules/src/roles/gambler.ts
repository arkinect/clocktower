import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const gambler = defineRole({
  id: roleId('gambler'),
  name: 'Gambler',
  type: 'townsfolk',
  abilityText: 'Each night*, choose a player & guess their character: if you guess wrong, you die.',
  night: { other: 50 },
  ability: {
    picker: (ctx) => ({
      title: 'Gambler',
      prompt: 'Choose a player and guess their character. If you guess wrong, you die.',
      fields: [
        { kind: 'player', label: 'Player', options: ctx.seated },
        { kind: 'role', label: 'Character', options: ctx.script },
      ],
    }),
    resolve(ctx) {
      const [t, guess] = ctx.choice;
      if (!t || !guess) return;
      const target = t as typeof ctx.holder;
      const right = ctx.character(target) === guess;
      ctx.outcome(`guessed ${ctx.name(t)} is ${ctx.roleName(guess)}: ${right ? 'right' : 'wrong'}`);
      if (right) return;
      if (ctx.impaired) ctx.outcome('impaired: does not die');
      else ctx.attemptKill(ctx.holder, 'self_gamble');
    },
  },
});
