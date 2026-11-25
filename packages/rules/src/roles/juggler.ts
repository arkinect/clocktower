import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole, type Instance } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { masked } from '../night/info';

interface State {
  /** Whether they guessed publicly on their 1st day, as the Storyteller recorded it. Null: not recorded. */
  juggled: boolean | null;
  /** Everyone's character when that was recorded: a guess is right or wrong when it is made. */
  characters?: Record<string, RoleId | null> | null;
}

/** Today's answer, which belongs to every holder of the ability (the Cannibal's jinx). */
const juggled = (ctx: AbilityCtx<State>) => ctx.peers.some((a) => a.state.juggled);

/**
 * The character a guess about this player is checked against. Whoever has changed since the guesses (a Minion made the
 * Imp, at dusk or tonight) counts as what they were. Anyone else counts as they register: a Recluse or a Spy may count
 * either way.
 */
function whenGuessed(ctx: AbilityCtx<State>, player: PlayerId): RoleId | null {
  const then = ctx.peers.find((a) => a.state.characters)?.state.characters?.[player];
  return then && then !== ctx.character(player) ? then : ctx.registers(player, 'character').character;
}

/** The Juggler themself, or a Drunk who thinks they are one: the Cannibal's copy is hidden from its holder. */
const ownsIt = (a: Instance) => !masked(a);

/**
 * The guesses the Juggler entered tonight, as player and character pairs. A Cannibal's hidden copy reads the executed
 * Juggler's (the jinx).
 */
function guessesOf(ctx: AbilityCtx<State>): { player: PlayerId; role: RoleId }[] {
  const values = ctx.choice.length
    ? ctx.choice
    : (ctx.peers
        .filter(ownsIt)
        .map((a) => ctx.choiceOf(a))
        .find((c) => c.length) ?? []);
  const out: { player: PlayerId; role: RoleId }[] = [];
  for (let i = 0; i + 1 < values.length; i += 2) {
    out.push({ player: values[i] as PlayerId, role: values[i + 1] as RoleId });
  }
  return out;
}

/** They have just guessed publicly: a guess is checked against everyone's character now. */
const guessedToday = (ctx: AbilityCtx<State>): State => ({
  juggled: true,
  characters: Object.fromEntries(ctx.seated.map((id) => [id, ctx.character(id)])),
});

export const juggler = defineRole<State>({
  id: roleId('juggler'),
  name: 'Juggler',
  type: 'townsfolk',
  autoplay: {
    claims: [
      {
        claim: 'juggled',
        title: "Juggler's guesses",
        fields: ['Claimant'],
        says: "{0} guesses players' characters, as the Juggler",
      },
    ],
  },
  abilityText:
    "On your 1st day, publicly guess up to 5 players' characters. That night, you learn how many you got correct.",
  reminder:
    'On the Day tab, record whether they guessed publicly. If they did, that night they enter their own guesses and learn how many were right.',
  night: { other: 340, note: 'Night 1 only, if they guessed publicly' },
  initialState: () => ({ juggled: null }),
  ability: {
    wakes: (ctx) => ctx.n === 1 && juggled(ctx),
    // Executed on their 1st day and eaten by the Cannibal: the dead Juggler still enters the guesses, for the jinx.
    wakesDead: (ctx) =>
      ctx.n === 1 &&
      ownsIt(ctx.ability) &&
      ctx.peers.some(
        (a) => !ownsIt(a) && a.activeUntil !== 'removed' && a.holder.kind === 'player' && ctx.isAlive(a.holder.id),
      ),
    picker(ctx) {
      if (!ownsIt(ctx.ability)) return null;
      const roles = (['townsfolk', 'outsider', 'minion', 'demon'] as const).flatMap((t) => ctx.charactersOfType(t));
      return {
        prompt: 'Enter the guesses you made today: up to 5 players, and the character you guessed for each.',
        maxRows: 5,
        distinct: true,
        fields: [
          { kind: 'player', label: 'Player', options: ctx.seated },
          { kind: 'role', label: 'Character', options: roles },
        ],
      };
    },
    dayActions(ctx) {
      if (ctx.n !== 1 || !ctx.firstPeer) return [];
      const recorded = ctx.peers.find((a) => a.state.juggled != null)?.state.juggled;
      return [
        {
          action: 'juggled',
          title: `Juggler (${ctx.name(ctx.holder)})`,
          prompt: 'Did they guess characters publicly today?',
          preview: false,
          order: 20,
          control: 'toggle',
          // Off unless changed: dusk records it, and a Juggler who did not guess is not asked tonight.
          recorded: recorded == null ? null : [recorded ? 'yes' : 'no'],
          default: ['no'],
          fields: [{ kind: 'option', label: 'Guessed', options: ['no', 'yes'], labels: { yes: 'Yes', no: 'No' } }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const value = values[0] === 'yes';
      ctx.setState(value ? guessedToday(ctx) : { juggled: false, characters: null });
      return {
        summary: value
          ? 'Recorded: they guessed publicly. Tonight they enter their guesses.'
          : 'Recorded: they did not guess publicly.',
        effective: true,
      };
    },
    onClaim(ctx, { values }) {
      if (ctx.n !== 1 || values[0] !== ctx.holder) return;
      ctx.setState(guessedToday(ctx));
    },
    resolve(ctx) {
      if (!ctx.canAct) {
        ctx.outcome('dead: the guesses are for the Cannibal');
        return;
      }
      const guesses = guessesOf(ctx);
      const truth = guesses.filter((g) => whenGuessed(ctx, g.player) === g.role).length;
      // No more can be right than were guessed, and in autoplay nobody is there to see that.
      ctx.informNumber(truth, 0, ctx.autoplay ? guesses.length : 5, (n) => [`You guessed ${n} correctly.`]);
    },
  },
});
