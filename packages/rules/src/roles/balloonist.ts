import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

interface State {
  shown: string[];
}

export const balloonist = defineRole<State>({
  id: roleId('balloonist'),
  name: 'Balloonist',
  type: 'townsfolk',
  abilityText:
    'Each night, you learn 1 player of each character type, until there are no more types to learn. [+1 Outsider]',
  night: { first: 170, other: 350 },
  initialState: () => ({ shown: [] }),
  setupRules: {
    counts(c) {
      c[1] += 1;
      c[0] -= 1;
    },
  },
  ability: {
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
