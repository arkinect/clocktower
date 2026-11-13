import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import type { AbilityCtx } from '../night/context';

interface Guess {
  player: PlayerId;
  role: RoleId;
}

interface State {
  /** The guesses made on their 1st day. */
  guesses?: Guess[] | null;
  /** A count entered by hand, from games saved before the guesses were recorded. */
  correct: number | null;
}

/** Today's guesses, which belong to every holder of the ability (the Cannibal's jinx). */
const guessesOf = (ctx: AbilityCtx<State>) => ctx.peers.find((a) => a.state.guesses?.length)?.state.guesses ?? null;
const countOf = (ctx: AbilityCtx<State>) => ctx.peers.find((a) => a.state.correct !== null)?.state.correct ?? null;

export const juggler = defineRole<State>({
  id: roleId('juggler'),
  name: 'Juggler',
  type: 'townsfolk',
  abilityText:
    "On your 1st day, publicly guess up to 5 players' characters. That night, you learn how many you got correct.",
  reminder: 'Record the guesses on the Day tab. Tonight works out how many were right, and Review lets you change it.',
  night: { other: 340, note: 'Night 1 only' },
  initialState: () => ({ guesses: null, correct: null }),
  ability: {
    // A hidden copy has something to learn only if guesses were recorded (the Cannibal's jinx).
    wakes: (ctx) =>
      ctx.n === 1 && (!!guessesOf(ctx) || countOf(ctx) !== null || ctx.ability.shownAs === ctx.ability.roleId),
    dayActions(ctx) {
      if (ctx.n !== 1 || !ctx.firstPeer) return [];
      const guesses = guessesOf(ctx);
      const roles = (['townsfolk', 'outsider', 'minion', 'demon'] as const).flatMap((t) => ctx.charactersOfType(t));
      return [
        {
          action: 'guesses',
          title: `Juggler (${ctx.name(ctx.holder)})`,
          prompt: 'Which character did they guess for each player?',
          preview: false,
          order: 20,
          control: 'rows',
          maxRows: 5,
          recorded: guesses ? guesses.flatMap((g) => [g.player, g.role]) : null,
          fields: [
            { kind: 'player', label: 'Player', options: ctx.seated },
            { kind: 'role', label: 'Character', options: roles },
          ],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const guesses: Guess[] = [];
      for (let i = 0; i + 1 < values.length; i += 2) {
        guesses.push({ player: values[i] as PlayerId, role: values[i + 1] as RoleId });
      }
      ctx.setState({ guesses: guesses.length ? guesses : null, correct: null });
      return { summary: `Recorded ${guesses.length} guess${guesses.length === 1 ? '' : 'es'}.`, effective: true };
    },
    resolve(ctx) {
      const guesses = guessesOf(ctx);
      // How each guessed player registers to the Juggler tonight: a Recluse or a Spy may count either way.
      const truth = guesses
        ? guesses.filter((g) => ctx.registers(g.player, 'character').character === g.role).length
        : (countOf(ctx) ?? 0);
      ctx.informNumber(truth, 0, 5, (n) => [`You guessed ${n} correctly.`]);
    },
  },
});
