import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { WORDS } from './words';

interface State {
  sayer: { day: number; player: PlayerId } | null;
}

export const mezepheles = defineRole<State>({
  id: roleId('mezepheles'),
  name: 'Mezepheles',
  type: 'minion',
  abilityText: 'You start knowing a secret word. The 1st good player to say this word becomes evil that night.',
  reminder: 'Record "Word said by X" in the Day panel.',
  night: { first: 90, other: 90, note: 'Only if a good player said the word' },
  flags: { oncePerGame: 'auto' },
  initialState: () => ({ sayer: null }),
  setupFields: [
    {
      field: 'word',
      title: 'Mezepheles secret word',
      kind: 'text',
      options: () => [],
      suggest: (_r, pick) => pick(WORDS),
      validate: (_r, value) => (value.length > 24 ? 'Enter a word (max 24 characters).' : null),
    },
  ],
  ability: {
    checklist(ctx) {
      return [{ id: 'word', label: 'Set the Mezepheles secret word', done: !!ctx.field('word'), blocking: true }];
    },
    briefing(ctx) {
      const word = ctx.field('word');
      if (word) ctx.notify(ctx.holder, 'Your secret word', [`The word is: ${word}`], { starting: true });
    },
    wakes: (ctx) => ctx.n >= 1 && ctx.state.sayer?.day === ctx.n && !ctx.ability.used,
    dayActions(ctx) {
      if (ctx.ability.used || (ctx.state.sayer && ctx.state.sayer.day !== ctx.n)) return [];
      return [
        {
          action: 'sayer',
          title: `Mezepheles (${ctx.name(ctx.holder)})`,
          prompt: 'Who was the first to say the word?',
          preview: false,
          order: 60,
          clearable: true,
          recorded: ctx.state.sayer?.day === ctx.n ? [ctx.state.sayer.player] : null,
          fields: [{ kind: 'player', label: 'Player', options: ctx.seated }],
        },
      ];
    },
    applyDayAction(ctx, _action, values) {
      if (!values.length) {
        ctx.setState({ sayer: null });
        return { summary: 'Nobody has said the word.', effective: true };
      }
      ctx.setState({ sayer: { day: ctx.n, player: values[0] as PlayerId } });
      return { summary: `${ctx.name(values[0])} said the word.`, effective: true };
    },
    resolve(ctx) {
      const t = ctx.state.sayer?.player;
      if (!t) return;
      ctx.markUsed();
      if (ctx.impaired) {
        ctx.outcome('impaired: no conversion, word spent');
        return;
      }
      // Nothing to confirm: the outcome follows from who said the word and whether the Mezepheles is impaired.
      if (!ctx.isAlive(t) || ctx.alignmentOf(t) !== 'good') {
        ctx.outcome(`${ctx.name(t)} is not a living good player: no conversion`);
        return;
      }
      ctx.changeAlignment(t, 'evil', 'said the Mezepheles word');
      ctx.notify(t, 'You are now evil.', ['Your character has not changed, but you are now on the evil team.']);
      ctx.outcome(`${ctx.name(t)} becomes evil`);
    },
  },
});
