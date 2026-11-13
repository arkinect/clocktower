// Every role definition, in sheet order. The core looks roles up here by id and never names one.
import type { CharacterType, RoleId } from '@ct/protocol';
import type { JinxDef } from '../jinxes/define';
import type { Instance, RoleDef } from './define';

const roles = new Map<RoleId, RoleDef>();
const scripted: RoleId[] = [];
const jinxes: JinxDef[] = [];

export function registerRole(def: RoleDef, options: { onDefaultScript: boolean } = { onDefaultScript: false }) {
  roles.set(def.id, def);
  if (options.onDefaultScript && !scripted.includes(def.id)) scripted.push(def.id);
}

export function registerJinx(jinx: JinxDef) {
  if (!jinxes.some((j) => j.a === jinx.a && j.b === jinx.b)) jinxes.push(jinx);
}

export const allJinxes = (): readonly JinxDef[] => jinxes;

export const jinxBetween = (x: RoleId, y: RoleId): JinxDef | undefined =>
  jinxes.find((j) => (j.a === x && j.b === y) || (j.a === y && j.b === x));

export const defaultScript = (): RoleId[] => scripted.slice();

export function roleDef(id: RoleId): RoleDef {
  const def = roles.get(id);
  if (!def) throw new Error(`Unknown role ${id}`);
  return def;
}

/** Whether holding this instance makes its holder the Demon. */
export function makesDemon(a: Instance): boolean {
  const flag = roleDef(a.roleId).flags.holderIsDemon;
  return typeof flag === 'function' ? flag(a) : !!flag;
}

export const findRole = (id: string): RoleDef | undefined => roles.get(id as RoleId);

export const allRoles = (): RoleDef[] => [...roles.values()];

export const scriptOrder = (ids: readonly RoleId[]): RoleId[] => {
  const set = new Set(ids);
  return allRoles()
    .filter((r) => set.has(r.id))
    .map((r) => r.id);
};

export const PLAYER_TYPES: readonly CharacterType[] = ['townsfolk', 'outsider', 'minion', 'demon'];

/** Night positions in walking order. Roles at the same position walk in registration order. */
export function nightSheet(n: number): RoleDef[] {
  const pos = (r: RoleDef) => (n === 0 ? r.night?.first : r.night?.other);
  return allRoles()
    .filter((r) => pos(r) !== undefined)
    .sort((a, b) => (pos(a) as number) - (pos(b) as number));
}
