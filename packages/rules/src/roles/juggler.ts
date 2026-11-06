import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

interface State {
  correct: number | null;
}

export const juggler = defineRole<State>({
  id: roleId('juggler'),
  name: 'Juggler',
  type: 'townsfolk',
  abilityText:
    "On your 1st day, publicly guess up to 5 players' characters. That night, you learn how many you got correct.",
  night: { other: 340, note: 'Night 1 only' },
  initialState: () => ({ correct: null }),
  ability: {
    // A hidden copy has something to learn only if the Storyteller entered a count (the Cannibal's jinx).
    wakes: (ctx) =>
      ctx.n === 1 && (ctx.peers.some((a) => a.state.correct !== null) || ctx.ability.shownAs === ctx.ability.roleId),
    dayActions(ctx) {
      if (ctx.n !== 1 || !ctx.firstPeer) return [];
      const options = ['0', '1', '2', '3', '4', '5'];
      return [
        {
          action: 'count',
          title: "Juggler's correct guesses",
          prompt: 'How many of the guesses were right?',
          preview: false,
          fields: [{ kind: 'option', label: 'Correct', options }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      ctx.setState({ correct: Number(values[0]) });
      return { summary: `Recorded: ${values[0]} correct.`, effective: true };
    },
    resolve(ctx) {
      const truth = ctx.peers.find((a) => a.state.correct !== null)?.state.correct ?? 0;
      ctx.informNumber(truth, 0, 5, (n) => [`You guessed ${n} correctly.`]);
    },
  },
});
