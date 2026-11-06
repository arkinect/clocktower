import { roleId } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const farmer = defineRole({
  id: roleId('farmer'),
  name: 'Farmer',
  type: 'townsfolk',
  abilityText: 'When you die at night, an alive good player becomes a Farmer.',
  night: { other: 240, note: 'Only if the Farmer died tonight: an alive good player becomes a Farmer' },
  flags: { worksWhileDead: true, wakesOnNightDeath: true, afterOrder: true },
  ability: {
    resolve(ctx) {
      if (ctx.believed || ctx.impaired) {
        if (!ctx.believed) ctx.malfunctionIfExternal('Farmer ability impaired');
        ctx.outcome(
          `${ctx.believed ? 'not really the Farmer' : 'drunk or poisoned when they died'}: nobody becomes a Farmer`,
        );
        return;
      }
      const role = ctx.ability.roleId;
      const good = ctx.alive.filter((x) => ctx.alignmentOf(x) === 'good');
      const fresh = good.filter((x) => ctx.character(x) !== role);
      const chosen = ctx.decide<string>({
        key: { kind: 'farmer' },
        title: `Farmer ${ctx.name(ctx.holder)} died: who becomes a Farmer?`,
        description:
          'Any alive good player (they stay good). Recommended at random among those who are not a Farmer already.',
        options: [
          ...good.map((x) => ({ id: x, label: `${ctx.name(x)} (${ctx.roleName(ctx.character(x))})` })),
          { id: 'nobody', label: 'Nobody' },
        ],
        default: fresh.length ? ctx.rng('heir').pick(fresh) : 'nobody',
      });
      const heir = good.find((x) => x === chosen);
      if (!heir) {
        ctx.outcome('nobody becomes a Farmer');
        return;
      }
      ctx.changeCharacter(heir, role, { reason: 'became a Farmer', keepGranted: false, noActTonight: true });
      ctx.notify(heir, 'You are now the Farmer', [ctx.role(role).abilityText]);
      ctx.outcome(`${ctx.name(heir)} becomes a Farmer`);
    },
  },
});
