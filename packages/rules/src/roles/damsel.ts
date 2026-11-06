import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

const DAMSEL = roleId('damsel');

interface State {
  result: string | null;
}

export const damsel = defineRole<State>({
  id: DAMSEL,
  name: 'Damsel',
  type: 'outsider',
  abilityText: 'All Minions know a Damsel is in play. If a Minion publicly guesses you (once), your team loses.',
  reminder: "Record a Minion's guess in the Day panel.",
  flags: { oncePerGame: 'auto' },
  initialState: () => ({ result: null }),
  night: { first: 120 },
  ability: {
    briefing(ctx) {
      if (ctx.believed || ctx.ability.holder.kind !== 'player') return;
      for (const id of ctx.minions) {
        if (ctx.role(ctx.character(id) as typeof DAMSEL).believes) continue;
        ctx.notify(id, 'Damsel', ['A Damsel is in play.'], { starting: true });
      }
    },
    // A Minion made after the briefing, from the Demon whose token they keep, hears it too.
    observeCharacterChange(ctx, change) {
      if (ctx.believed || ctx.moment.kind !== 'day' || ctx.n !== 1 || !change.from) return;
      if (ctx.role(change.from).type === 'demon' && ctx.role(change.to).type === 'minion') {
        ctx.notify(change.playerId, 'Damsel', ['A Damsel is in play.'], { starting: true });
      }
    },
    // The evil team can still guess once this character has gone.
    onCharacterChange(ctx, change) {
      if (ctx.n >= 0 && change.to && ctx.isActive(ctx.ability)) ctx.grantToGame(DAMSEL, ctx.ability.used, ctx.state);
    },
    dayActions(ctx) {
      if (!ctx.firstPeer || ctx.peers.some((a) => a.used)) return [];
      return [
        {
          action: 'guess',
          title: 'Damsel guess',
          prompt: 'Who did a Minion publicly guess?',
          fields: [{ kind: 'player', label: 'Guess', options: ctx.seated }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      const t = values[0] as PlayerId;
      ctx.markUsed();
      let summary: string;
      let win = false;
      if (ctx.character(t) !== DAMSEL) summary = `${ctx.name(t)} is not the Damsel. Wrong guess, nothing happens.`;
      else if (!ctx.isAlive(t) || ctx.isImpaired(t))
        summary = 'The guess has no effect because the Damsel is drunk, poisoned or dead.';
      else {
        win = true;
        summary = 'The Damsel was guessed: the good team loses.';
        ctx.suggestGameEnd('damsel', 'evil', summary);
      }
      ctx.setState({ result: summary });
      return { summary, effective: win };
    },
    summary: (ctx) => (ctx.state.result ? [ctx.state.result] : []),
  },
});
