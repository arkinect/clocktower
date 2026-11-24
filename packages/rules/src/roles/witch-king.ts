// Homebrew: not an official character. The Witch's curse turned round: it goes off on the nominee, not the nominator.
// Or, instead of cursing, a plain Demon kill.
import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { applyCurse, curse, curseSwitches, type CurseState } from './lib';

const KILL = 'kill';

export const witchKing = defineRole<CurseState>({
  id: roleId('witch_king'),
  name: 'Witch King',
  type: 'demon',
  abilityText:
    'Each night*, choose up to 2 players: if they are nominated tomorrow, they die. Or, choose 1 player: they die.',
  reminder: 'If a cursed player is nominated, apply the curse in the Day panel.',
  // Among the Demons, with the others' kills.
  night: { other: 115 },
  initialState: () => ({ applied: [] }),
  ability: {
    // Up to 2 curses, each a row, or 1 kill. "No one" does neither.
    picker: (ctx) => ({
      title: 'Witch King',
      prompt: 'Curse up to 2 players: if they are nominated tomorrow, they die. Or kill 1 player tonight.',
      fields: [{ kind: 'player', options: ctx.seated }],
      modes: [
        { id: 'curse', label: 'Curse', maxRows: 2 },
        { id: KILL, label: 'Kill' },
      ],
      distinct: true,
      allowDecline: true,
      declineLabel: 'No one',
    }),
    resolve(ctx) {
      const ts = ctx.choice as PlayerId[];
      if (!ts.length) {
        ctx.outcome('chose no one: no curse, no kill');
        return;
      }
      const names = ts.map(ctx.name).join(' and ');
      ctx.tell([`You chose ${names}.`]);
      if (ctx.mode === KILL) {
        if (ctx.impaired) ctx.outcome('impaired: no kill');
        else ctx.attemptKill(ts[0] as PlayerId, 'demon_attack');
        return;
      }
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
