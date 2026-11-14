import type { RoleId } from '@ct/protocol';
import type { Reader } from '../derive/reader';
import type { AbilityCtx } from '../night/context';

export const DJINN = 'https://wiki.bloodontheclocktower.com/Djinn';

/** Whether a player with this character was told they are `role` (the setup jinxes with the Marionette). */
export const believes = (r: Reader, who: RoleId, role: RoleId) =>
  r.seated.some((id) => r.character(id) === who && r.w.setup.bag[id] === role);

/** Counts an ability a player only believes they have, if it gave false information or failed to work. */
export function countBelieved(ctx: AbilityCtx<unknown>, who: RoleId, name: string) {
  const cause = `Jinx (Mathematician & ${name})`;
  for (const pid of ctx.seated) {
    if (ctx.character(pid) !== who) continue;
    if (ctx.run.malfunctions.some((m) => m.playerId === pid && m.cause === cause)) continue;
    const told = ctx.w.setup.bag[pid];
    const rows = ctx.resultsFor(pid).filter((r) => r.roleId === told);
    if (rows.some((r) => r.final.join('\n') !== r.truth.join('\n'))) {
      ctx.malfunction(pid, cause, `${name}'s ability yielded false info`);
    } else if (ctx.believedChose(pid) && rows.every((r) => r.confirmation)) {
      ctx.malfunction(pid, cause, `${name}'s ability failed`);
    }
  }
}
