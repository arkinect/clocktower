import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { note, player } from '../night/info';

const BALLOONIST = roleId('balloonist');

interface State {
  /** The character type of the player shown last night, true or not: tonight's has to differ from it. */
  last: string | null;
}

export const balloonist = defineRole<State>({
  id: BALLOONIST,
  name: 'Balloonist',
  type: 'townsfolk',
  autoplay: true,
  abilityText: 'Each night, you learn a player of a different character type than last night. [+0 or +1 Outsider]',
  night: { first: 170, other: 350 },
  initialState: () => ({ last: null }),
  // Not `late`, so the Godfather's "is there an Outsider to remove" check sees this choice.
  setupRules: {
    choice: { field: 'outsiders', options: ['+0', '+1'] },
    counts(c, q) {
      // Not chosen yet counts as +1, as before the choice existed, so suggestions stay stable.
      if (q.field(BALLOONIST, 'outsiders') === '+0') return;
      c[1] += 1;
      c[0] -= 1;
    },
  },
  setupFields: [
    {
      field: 'outsiders',
      title: 'Balloonist: Outsiders +0 or +1',
      kind: 'option',
      options: () => [
        { id: '+0', label: '+0 Outsiders' },
        { id: '+1', label: '+1 Outsider' },
      ],
    },
  ],
  ability: {
    checklist(ctx) {
      const chosen = ctx.field('outsiders');
      return [
        {
          id: 'balloonist',
          label: `Balloonist: Outsiders +0 or +1${chosen ? ` (chosen: ${chosen})` : ''}`,
          done: chosen !== null,
          blocking: true,
        },
      ];
    },
    resolve(ctx) {
      const typeOf = (id: PlayerId) => (ctx.isDemon(id) ? 'demon' : (ctx.typeOf(id) ?? ''));
      const others = ctx.seated.filter((x) => x !== ctx.holder);
      if (!others.length) return;
      const last = ctx.state.last ?? null;
      const labelled = (ids: PlayerId[]) => ids.map((x) => ({ id: x, label: `${ctx.name(x)} (${typeOf(x)})` }));
      const differs = others.filter((x) => typeOf(x) !== last);
      if (ctx.impaired) {
        // Nothing true to decide: the false name is chosen with the result, like any other impaired answer.
        ctx.inform({
          truth: note(['(impaired, no true information)']),
          fake: player(ctx.rng('pick').pick(others)),
          alternatives: others.map((x) => player(x)),
          // True is a player of a different character type than last night's, and false is one of the same.
          real: differs.length ? player(ctx.rng('real').pick(differs)) : null,
          lies: others.filter((x) => !differs.includes(x)).map((x) => player(x)),
        });
        // Whoever the answer going out names; a written answer that names nobody leaves tomorrow open.
        const told = ctx.resultsFor(ctx.holder).at(-1)?.final.join(' ');
        const shown = others.find((x) => ctx.name(x) === told);
        ctx.setState({ last: shown ? typeOf(shown) : null });
        return;
      }
      const candidates = others.filter((x) => typeOf(x) !== last);
      if (!candidates.length) {
        ctx.setState({ last: null });
        ctx.tell(['There is no player of a different character type to show.']);
        return;
      }
      const pick = ctx.decide({
        key: { kind: 'balloonist' },
        title: `Balloonist ${ctx.name(ctx.holder)}: show which player?`,
        description: '',
        options: labelled(candidates),
        default: ctx.rng('pick').pick(candidates),
      });
      ctx.setState({ last: typeOf(pick) });
      ctx.inform({ truth: player(pick) });
    },
  },
});
