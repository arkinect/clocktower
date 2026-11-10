import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

const BALLOONIST = roleId('balloonist');

interface State {
  shown: string[];
}

export const balloonist = defineRole<State>({
  id: BALLOONIST,
  name: 'Balloonist',
  type: 'townsfolk',
  abilityText:
    'Each night, you learn 1 player of each character type, until there are no more types to learn. [+0 or +1 Outsider]',
  night: { first: 170, other: 350 },
  initialState: () => ({ shown: [] }),
  // Not `late`, so the Godfather's "is there an Outsider to remove" check sees this choice.
  setupRules: {
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
      const shown = ctx.state.shown;
      const labelled = (ids: PlayerId[]) => ids.map((x) => ({ id: x, label: `${ctx.name(x)} (${typeOf(x)})` }));
      if (ctx.impaired) {
        const pick = ctx.decide({
          key: { kind: 'balloonist' },
          title: `Balloonist ${ctx.name(ctx.holder)} (impaired): show which player?`,
          description: 'Any player may be shown.',
          options: labelled(others),
          default: ctx.rng('pick').pick(others),
        });
        ctx.inform({ truth: ['(impaired, no true information)'], falseLines: [ctx.name(pick)] });
        return;
      }
      const candidates = others.filter((x) => !shown.includes(typeOf(x)));
      if (!candidates.length) {
        ctx.inform({ truth: ['You learn nothing new.'] });
        return;
      }
      const pick = ctx.decide({
        key: { kind: 'balloonist' },
        title: `Balloonist ${ctx.name(ctx.holder)}: show which player?`,
        description: `Types already shown: ${shown.join(', ') || 'none'}.`,
        options: labelled(candidates),
        default: ctx.rng('pick').pick(candidates),
      });
      ctx.setState({ shown: [...shown, typeOf(pick)] });
      ctx.inform({ truth: [ctx.name(pick)] });
    },
  },
});
