// Homebrew: not an official character. The Witch's curse turned round: it goes off on the nominee, not the nominator.
import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { applyCurse, curse, curseSwitches, type CurseState } from './lib';

export const witchKing = defineRole<CurseState>({
  id: roleId('witch_king'),
  name: 'Witch King',
  type: 'demon',
  abilityText: 'Each night*, choose up to 2 players: if they are nominated tomorrow, they die.',
  reminder: 'If a cursed player is nominated, apply the curse in the Day panel.',
  // Among the Demons: it curses from the night they start killing. Its curses kill by day, so tonight's order only
  // needs it after the Poisoner.
  night: { other: 115 },
  initialState: () => ({ applied: [] }),
  ability: {
    // Up to 2: each pick is a row, and "No one" leaves both empty.
    picker: (ctx) => ({
      title: 'Witch King',
      prompt: 'Choose up to 2 players: if they are nominated tomorrow, they die.',
      fields: [{ kind: 'player', options: ctx.seated }],
      maxRows: 2,
      distinct: true,
      allowDecline: true,
      declineLabel: 'No one',
    }),
    resolve(ctx) {
      const ts = ctx.choice as PlayerId[];
      if (!ts.length) {
        ctx.outcome('chose no one: no curse');
        return;
      }
      const names = ts.map(ctx.name).join(' and ');
      ctx.tell([`You chose ${names}.`]);
      if (ctx.impaired) {
        ctx.outcome('impaired: no curse');
        return;
      }
      for (const t of ts) curse(ctx, t);
      ctx.outcome(`${names} ${ts.length > 1 ? 'are' : 'is'} cursed: dies if nominated tomorrow`);
    },
    dayActions: (ctx) =>
      curseSwitches(ctx, {
        title: `Witch King (${ctx.name(ctx.holder)})`,
        prompt: 'Was this player nominated?',
        order: 72,
      }),
    // A switch: the second press on the same player takes it back, reviving them if it killed them.
    applyDayAction: (ctx, _action, values, force) =>
      applyCurse(ctx, values[0] as PlayerId, 'demon_attack', force, 'Witch King curse'),
  },
});
