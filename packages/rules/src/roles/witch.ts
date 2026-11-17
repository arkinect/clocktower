import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { applyCurse, choosePlayers, confirmChoice, curse, curseSwitches, type CurseState } from './lib';

export const witch = defineRole<CurseState>({
  id: roleId('witch'),
  name: 'Witch',
  type: 'minion',
  abilityText:
    'Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.',
  reminder: 'If the cursed player nominates, apply the curse in the Day panel.',
  night: { first: 80, other: 80, note: "Only while 4 or more players are alive (Travellers don't count)" },
  initialState: () => ({ applied: [] }),
  ability: {
    // Travellers don't count towards "if just 3 players live", as with the Mayor and the Scarlet Woman.
    wakes: (ctx) => ctx.aliveAtDuskIds.filter((id) => ctx.typeOf(id) !== 'traveller').length >= 4,
    picker: (ctx) => choosePlayers('Witch', 'Choose a player: if they nominate tomorrow, they die.', 1, ctx.seated),
    resolve(ctx) {
      const [t] = ctx.choice as PlayerId[];
      if (!t) return;
      confirmChoice(ctx, t);
      if (ctx.aliveResidents.length <= 3) {
        ctx.outcome('3 or fewer players alive: the Witch has no ability');
        return;
      }
      if (ctx.impaired) {
        ctx.outcome('impaired: no curse');
        return;
      }
      curse(ctx, t);
      ctx.outcome(`${ctx.name(t)} is cursed: dies if they nominate tomorrow`);
    },
    dayActions: (ctx) =>
      curseSwitches(ctx, { title: `Witch (${ctx.name(ctx.holder)})`, prompt: 'Did this player nominate?', order: 70 }),
    // A switch: the second press on the same player takes it back, reviving them if it killed them.
    applyDayAction: (ctx, _action, values, force) =>
      applyCurse(ctx, values[0] as PlayerId, 'witch', force, 'Witch curse'),
  },
});
