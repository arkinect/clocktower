// Ability-less characters for core tests. They never reach a default script outside the tests.
import { roleId, type RoleId } from '@ct/protocol';
import { defineRole, registerRole } from '../../src';
import type { CharacterType } from '@ct/protocol';

function plain(id: string, name: string, type: CharacterType): RoleId {
  const def = defineRole({ id: roleId(id), name, type, abilityText: `${name} does nothing.` });
  registerRole(def);
  return def.id;
}

export const TOWN = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => plain(`t-town-${i}`, `Town ${i}`, 'townsfolk'));
export const OUT = [1, 2, 3].map((i) => plain(`t-out-${i}`, `Out ${i}`, 'outsider'));
export const MINION = [1, 2, 3].map((i) => plain(`t-minion-${i}`, `Minion ${i}`, 'minion'));
export const DEMON = [1, 2].map((i) => plain(`t-demon-${i}`, `Demon ${i}`, 'demon'));
export const TRAVELLER = [plain('t-traveller', 'Wanderer', 'traveller')];
export const PLAIN_SCRIPT: RoleId[] = [...TOWN, ...OUT, ...MINION, ...DEMON];
