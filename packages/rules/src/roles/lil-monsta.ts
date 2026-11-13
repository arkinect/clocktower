import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

const LIL_MONSTA = roleId('lil_monsta');

const isToken = (origin: { kind: string }) => origin.kind !== 'character';

export const lilMonsta = defineRole({
  id: LIL_MONSTA,
  name: "Lil' Monsta",
  type: 'demon',
  abilityText:
    'Each night, Minions choose who babysits Lil\' Monsta\'s token & "is the Demon". A player dies each night*. [+1 Minion]',
  night: { other: 180, note: 'The token holder passes the token and chooses the victim' },
  flags: { holderIsDemon: true },
  setupFields: [
    {
      field: 'minion',
      title: "The Minion the Lil' Monsta player becomes",
      kind: 'role',
      rowLabel: 'plays as',
      options: (r) =>
        r
          .scriptOfType('minion')
          .filter((x) => !r.inPlay.includes(x))
          .map((id) => ({ id, label: r.roleName(id) })),
    },
  ],
  ability: {
    checklist(ctx) {
      const m = ctx.field('minion') as RoleId | null;
      return [
        {
          id: 'lil_monsta',
          label: "Choose the Minion role the Lil' Monsta player becomes",
          done: !!m && ctx.role(m).type === 'minion' && !ctx.inPlay.includes(m),
          blocking: true,
        },
      ];
    },
    // At the end of night 0 the player becomes the chosen Minion and holds the token.
    onPublish(ctx) {
      if (ctx.n !== 1 || isToken(ctx.ability.origin) || ctx.ability.activeUntil === 'removed') return;
      const me = ctx.holder;
      const minion = ctx.field('minion') as RoleId | null;
      if (minion) {
        ctx.notify(me, `Your role is now ${ctx.roleName(minion)}`, [
          ctx.role(minion).abilityText,
          "You hold Lil' Monsta's token. You are the Demon.",
        ]);
        ctx.changeCharacter(me, minion, {
          reason: "Lil' Monsta becomes a Minion",
          alignment: 'natural',
          keepTies: true,
        });
      }
      ctx.grant(me, LIL_MONSTA);
    },
    wakes: (ctx) => isToken(ctx.ability.origin),
    dayActions(ctx) {
      if (!isToken(ctx.ability.origin)) return [];
      return [
        {
          action: 'move_token',
          title: "Lil' Monsta token holder",
          prompt: 'Who should hold the token?',
          preview: false,
          recorded: [ctx.holder],
          fields: [{ kind: 'player', label: 'Holder', options: ctx.seated }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const to = values[0] as PlayerId;
      ctx.move(ctx.ability.id, to);
      return { summary: `${ctx.name(to)} holds Lil' Monsta's token.`, effective: true };
    },
    picker: (ctx) => ({
      title: "Lil' Monsta",
      prompt:
        "You hold Lil' Monsta's token. Choose a living Minion to babysit it next (yourself to keep it), and a player to die.",
      fields: [
        { kind: 'player', label: 'Pass the token to', options: ctx.alive.filter((x) => ctx.typeOf(x) === 'minion') },
        { kind: 'player', label: 'Victim', options: ctx.seated },
      ],
    }),
    resolve(ctx) {
      const [pass, victim] = ctx.choice as PlayerId[];
      if (!pass || !victim) return;
      const me = ctx.holder;
      if (ctx.impaired) {
        ctx.outcome('impaired: no kill, token stays');
        return;
      }
      ctx.attemptKill(victim, 'demon_attack');
      if (ctx.holder === me && pass !== me) {
        ctx.move(ctx.ability.id, pass);
        ctx.notify(pass, "Lil' Monsta", ["You hold Lil' Monsta's token. You are the Demon.", ...ctx.demonInfo(pass)]);
        ctx.outcome(`token passes to ${ctx.name(pass)}`);
      }
    },
  },
});
