import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole, type Instance } from '../abilities/define';
import type { AbilityCtx } from '../night/context';

const LIL_MONSTA = roleId('lil_monsta');

interface State {
  /**
   * The two abilities the character leaves behind at the first dawn. The token makes whoever babysits it the Demon.
   * The keeper stays with the player who was Lil' Monsta, a Minion now, who chooses each night who babysits.
   */
  part: 'token' | 'keeper';
  /** A Scarlet Woman who took the token over keeps it for the rest of the game (the jinx). */
  heir?: PlayerId | null;
}

const partOf = (a: Instance): State['part'] | 'character' =>
  a.origin.kind === 'character' ? 'character' : ((a.state as State | undefined)?.part ?? 'token');

const isToken = (a: Instance) => partOf(a) === 'token';

function findPart(ctx: AbilityCtx<State>, part: State['part']): Instance | undefined {
  return ctx.instances.find((a) => a.roleId === LIL_MONSTA && partOf(a) === part);
}

const holderOf = (a: Instance | undefined): PlayerId | null => (a?.holder.kind === 'player' ? a.holder.id : null);

/** A Scarlet Woman took the token over (the only way it is inherited): by the jinx, nobody can move it again. */
function lockedToHeir(token: Instance | undefined): boolean {
  const heir = (token?.state as State | undefined)?.heir;
  return !!heir && heir === holderOf(token);
}

/** The keeper chooses the babysitter every night, dead or alive, unless the token is locked to a Scarlet Woman. */
function keeperWakes(ctx: AbilityCtx<State>): boolean {
  return ctx.n >= 1 && !!holderOf(findPart(ctx, 'keeper')) && !lockedToHeir(findPart(ctx, 'token'));
}

/** The evil team learns who babysits, the keeper aside (they chose). A good babysitter is never told. */
function tellWhoBabysits(ctx: AbilityCtx<State>, sitter: PlayerId) {
  for (const p of ctx.seated) {
    if (p === ctx.holder || ctx.alignmentOf(p) !== 'evil') continue;
    ctx.notify(p, "Lil' Monsta", [`${ctx.name(sitter)} is babysitting Lil' Monsta.`]);
  }
}

/** The night's death, which the Storyteller chooses. The babysitter is the Demon, so it is their kill. */
function strike(ctx: AbilityCtx<State>) {
  const sitter = ctx.holder;
  if (!ctx.isAlive(sitter)) {
    ctx.outcome(`${ctx.name(sitter)} is dead: nobody dies`);
    return;
  }
  if (ctx.impaired) {
    ctx.malfunctionIfExternal("Lil' Monsta ability impaired", sitter);
    ctx.outcome('impaired: no kill');
    return;
  }
  const pool = ctx.alive.filter((x) => x !== sitter);
  const victim = ctx.decide<string>({
    key: { kind: 'lil_monsta' },
    title: "Lil' Monsta: who dies?",
    description: `${ctx.name(sitter)} is babysitting and can't be chosen. The suggestion is random, nobody included.`,
    options: [{ id: 'none', label: 'Nobody' }, ...pool.map((x) => ({ id: x, label: ctx.name(x) }))],
    default: ctx.rng('victim').pick(['none', ...pool]),
  });
  const target = pool.find((x) => x === victim);
  if (!target) {
    ctx.outcome('nobody dies');
    return;
  }
  ctx.attemptKill(target, 'demon_attack');
}

export const lilMonsta = defineRole<State>({
  id: LIL_MONSTA,
  name: "Lil' Monsta",
  type: 'demon',
  abilityText:
    'Each night, Minions choose who babysits Lil\' Monsta\'s token & "is the Demon". A player dies each night*. [+1 Minion]',
  night: { other: 180, note: 'The keeper chooses the babysitter; you choose who dies' },
  flags: { holderIsDemon: isToken, quietImpairment: true, noBluffs: true },
  initialState: () => ({ part: 'token', heir: null }),
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
    // At the end of night 0 the player becomes the chosen Minion, babysits the token, and keeps choosing who does.
    onPublish(ctx) {
      if (ctx.n !== 1 || partOf(ctx.ability) !== 'character' || ctx.ability.activeUntil === 'removed') return;
      const me = ctx.holder;
      const minion = ctx.field('minion') as RoleId | null;
      if (minion) {
        ctx.notify(me, `Your role is now ${ctx.roleName(minion)}`, [
          ctx.role(minion).abilityText,
          "You hold Lil' Monsta's token. You are the Demon.",
          "Each night you choose who babysits Lil' Monsta's token, yourself included. Whoever babysits it is the Demon.",
        ]);
        ctx.changeCharacter(me, minion, {
          reason: "Lil' Monsta becomes a Minion",
          alignment: 'natural',
          keepTies: true,
        });
      }
      ctx.grant(me, LIL_MONSTA, { state: { part: 'token', heir: null } });
      ctx.grant(me, LIL_MONSTA, { state: { part: 'keeper', heir: null } });
    },
    // One of the two acts each night: the keeper, or the token by itself once a Scarlet Woman has it.
    wakes(ctx) {
      const part = partOf(ctx.ability);
      if (part === 'keeper') return keeperWakes(ctx);
      return part === 'token' && ctx.n >= 1 && !keeperWakes(ctx);
    },
    // The keeper keeps choosing after they die.
    wakesDead: (ctx) => partOf(ctx.ability) === 'keeper' && keeperWakes(ctx),
    dayActions(ctx) {
      if (!isToken(ctx.ability)) return [];
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
    picker(ctx) {
      if (partOf(ctx.ability) !== 'keeper') return null;
      return {
        title: "Lil' Monsta",
        prompt: "Choose who babysits Lil' Monsta tonight.",
        fields: [{ kind: 'player', label: 'Babysitter', options: ctx.alive }],
      };
    },
    resolve(ctx) {
      const token = isToken(ctx.ability) ? ctx.ability : findPart(ctx, 'token');
      if (!token) return;
      if (partOf(ctx.ability) === 'keeper') {
        const [sitter] = (ctx.choice ?? []) as PlayerId[];
        const from = holderOf(token);
        // Choosing who babysits is the Minions' choice, not an ability, so nothing stops it.
        if (sitter && from) {
          if (sitter !== from) ctx.move(token.id, sitter);
          tellWhoBabysits(ctx, sitter);
          ctx.outcome(`${ctx.name(sitter)} babysits the token`);
        }
      }
      strike(ctx.run.ctx(token) as AbilityCtx<State>);
    },
  },
});
