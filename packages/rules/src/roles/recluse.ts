import { roleId, type CharacterType } from '@ct/protocol';
import { defineRole } from '../abilities/define';

export const recluse = defineRole({
  id: roleId('recluse'),
  name: 'Recluse',
  type: 'outsider',
  abilityText: 'You might register as evil & as a Minion or Demon, even if dead.',
  flags: { passive: true },
  ability: {
    registersAs(ctx, q) {
      if (ctx.ability.holder.kind !== 'player' || ctx.believed || ctx.impaired) return null;
      const me = ctx.holder;
      const name = ctx.name(me);
      const asked = `Asked by ${q.asker.name} (${ctx.name(q.asker.player)}).`;
      const base = { alive: ctx.isAlive(me) };
      const self = ctx.ability.roleId;
      if (q.wants === 'character') {
        const evil = [...ctx.scriptOfType('minion'), ...ctx.scriptOfType('demon')];
        const chosen = ctx.decide<string>({
          key: { kind: 'registration', subject: q.asker.ability, detail: 'character' },
          title: `Which character does ${name} (Recluse) register as?`,
          description: asked,
          options: [
            { id: 'truthful', label: 'Truthfully (Recluse)' },
            ...evil.map((r) => ({ id: r, label: ctx.roleName(r) })),
          ],
          default: 'truthful',
        });
        const shown = evil.find((r) => r === chosen);
        if (!shown) return null;
        if (q.asker.player) {
          ctx.malfunction(
            q.asker.player,
            'recluse',
            `${name} (Recluse) registered as ${ctx.roleName(shown)} to ${q.asker.name}`,
          );
        }
        return { ...base, character: shown, type: ctx.role(shown).type, alignment: 'evil' };
      }
      const chosen = ctx.decide({
        key: { kind: 'registration', subject: q.asker.ability, detail: 'alignment' },
        title: `How does ${name} (Recluse) register?`,
        description: `${asked} Applies to this query only.`,
        options: [
          { id: 'truthful', label: 'Truthfully (good Outsider)' },
          { id: 'minion', label: 'As an evil Minion' },
          { id: 'demon', label: 'As an evil Demon' },
        ],
        default: 'truthful',
      });
      if (chosen === 'truthful') return null;
      if (q.asker.player) {
        ctx.malfunction(q.asker.player, 'recluse', `${name} (Recluse) registered as ${chosen} to ${q.asker.name}`);
      }
      return { ...base, character: self, type: chosen as CharacterType, alignment: 'evil' };
    },
  },
});
