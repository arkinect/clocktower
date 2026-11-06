import { roleId, type PlayerId } from '@ct/protocol';
import { defineRole } from '../abilities/define';
import { choosePlayers } from './lib';

const FT = roleId('fortune_teller');

export const fortuneTeller = defineRole({
  id: FT,
  name: 'Fortune Teller',
  type: 'townsfolk',
  abilityText:
    'Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you.',
  night: { first: 150, other: 300 },
  setupFields: [
    {
      field: 'herring',
      title: "Fortune Teller's red herring",
      kind: 'player',
      options: (r) => r.seated.filter((id) => r.alignmentOf(id) === 'good').map((id) => ({ id, label: r.name(id) })),
      suggest(r, pick) {
        const c = r.seated.filter((id) => {
          const role = r.character(id);
          if (r.alignmentOf(id) !== 'good' || role === FT || !role) return false;
          const def = r.role(role);
          return !def.believes && !def.ability.registersAs;
        });
        return c.length ? pick(c) : null;
      },
    },
  ],
  ability: {
    checklist(ctx) {
      if (ctx.isBelieved(ctx.ability) || ctx.ability.origin.kind !== 'character') return [];
      const rh = ctx.field('herring');
      return [
        {
          id: 'red_herring',
          label: "Choose the Fortune Teller's red herring (a good player)",
          done: !!rh && ctx.seated.includes(rh as PlayerId) && ctx.alignmentOf(rh as PlayerId) === 'good',
          blocking: true,
        },
      ];
    },
    picker: (ctx) =>
      choosePlayers('Fortune Teller', 'Choose 2 players: you learn if either is a Demon.', 2, ctx.seated),
    resolve(ctx) {
      const ts = ctx.choice as PlayerId[];
      if (ts.length !== 2) return;
      const herring = ctx.setupValue(FT, 'herring');
      const yes = ts.some((t) => t === herring || ctx.registers(t).type === 'demon');
      const fmt = (v: boolean) => [
        `${ts.map(ctx.name).join(' and ')}: ${v ? 'Yes, one of them is a Demon.' : 'No, neither is a Demon.'}`,
      ];
      ctx.inform({ truth: fmt(yes), falseLines: fmt(!yes), alternatives: [fmt(true), fmt(false)] });
    },
  },
});
