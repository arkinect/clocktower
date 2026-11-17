import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole, type Instance } from '../abilities/define';
import type { AbilityCtx } from '../night/context';
import { masked } from '../night/info';

interface State {
  /** Whether they guessed publicly on their 1st day, as the Storyteller recorded it. Null: not recorded. */
  juggled: boolean | null;
}

/** Today's answer, which belongs to every holder of the ability (the Cannibal's jinx). */
const juggled = (ctx: AbilityCtx<State>) => ctx.peers.some((a) => a.state.juggled);

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

export const juggler = defineRole<State>({
  id: roleId('juggler'),
  name: 'Juggler',
  type: 'townsfolk',
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
      ctx.setState({ juggled: value });
      return {
        summary: value
          ? 'Recorded: they guessed publicly. Tonight they enter their guesses.'
          : 'Recorded: they did not guess publicly.',
        effective: true,
      };
    },
    resolve(ctx) {
      if (!ctx.canAct) {
        ctx.outcome('dead: the guesses are for the Cannibal');
        return;
      }
      const guesses = guessesOf(ctx);
      // How each guessed player registers to the Juggler tonight: a Recluse or a Spy may count either way.
      const truth = guesses.filter((g) => ctx.registers(g.player, 'character').character === g.role).length;
      ctx.informNumber(truth, 0, 5, (n) => [`You guessed ${n} correctly.`]);
    },
  },
});
