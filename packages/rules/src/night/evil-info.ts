// Night 0's evil information. Who learns what comes from the policy setting, then each modifyEvilInfo hook adjusts it.
import type { PlayerId } from '@ct/protocol';
import type { EvilInfoDraft } from '../abilities/define';
import { roleDef } from '../abilities/registry';
import { HookCtx } from './context';
import type { Run } from './run';

/** Official sheet positions for the core's own steps on night 0. */
export const MINION_INFO_POSITION = 13;
export const DEMON_INFO_POSITION = 16;

const OFFICIAL_THRESHOLD = 7;

/** Teensyville: in a game of 6 or fewer (Travellers aside), the Demon and Minions do not learn each other. */
export function isTeensyville(run: Run): boolean {
  const r = run.reader;
  if (r.w.settings.evilInfoPolicy !== 'teensyville') return false;
  return r.seated.filter((id) => r.typeOf(id) !== 'traveller').length < OFFICIAL_THRESHOLD;
}

export function evilInfo(run: Run): EvilInfoDraft {
  const r = run.reader;
  const official = r.w.settings.evilInfoPolicy !== 'house';
  const draft: EvilInfoDraft = {
    minions: r.minions,
    demonSees: r.seated.filter((id) => r.typeOf(id) === 'minion' && !r.isDemon(id)),
    demonLines: [],
    minionsLearnDemon: official && r.aliveResidents.length >= OFFICIAL_THRESHOLD,
  };
  for (const a of r.instances) {
    const hook = roleDef(a.roleId).ability.modifyEvilInfo;
    if (hook) hook(new HookCtx(r, a), draft);
  }
  // Applied after the hooks, so no ability can slip the evil team's names back in.
  if (isTeensyville(run)) {
    draft.demonSees = [];
    draft.demonLines = [];
    draft.minionsLearnDemon = false;
  }
  return draft;
}

export function demonInfoLines(run: Run, demon: PlayerId, draft: EvilInfoDraft = evilInfo(run)): string[] {
  const r = run.reader;
  const seen = draft.demonSees.filter((id) => id !== demon);
  const lines = isTeensyville(run)
    ? ['In a game this small, you do not learn who your Minions are.']
    : [seen.length ? `Your Minions: ${seen.map(r.name).join(', ')}` : 'You have no Minions.'];
  lines.push(...draft.demonLines);
  const noBluffs = r.instances.some((a) => roleDef(a.roleId).flags.noBluffs);
  if (r.w.setup.bluffs.length && !noBluffs)
    lines.push(`Not in play (bluffs): ${r.w.setup.bluffs.map(r.roleName).join(', ')}`);
  lines.push('Tell your Minions who you are in person.');
  return lines;
}

export function deliverEvilInfo(run: Run) {
  const r = run.reader;
  const draft = evilInfo(run);
  const teensy = isTeensyville(run);
  const demons = r.demons;
  for (const id of r.seated) {
    if (r.isDemon(id)) run.deliver(id, 'starting', 'Demon information', demonInfoLines(run, id, draft));
    if (teensy && draft.minions.includes(id)) {
      run.deliver(id, 'starting', 'Your fellow Minions', [
        'In a game this small, you do not learn who the other Minions or the Demon are.',
      ]);
    } else if (draft.minions.includes(id)) {
      const others = draft.minions.filter((x) => x !== id).map(r.name);
      const lines = [others.length ? `The other Minions are: ${others.join(', ')}.` : 'You are the only Minion.'];
      lines.push(
        draft.minionsLearnDemon
          ? `The Demon is: ${demons.map(r.name).join(', ')}.`
          : 'The Demon will reveal themselves to you at the table.',
      );
      run.deliver(id, 'starting', 'Your fellow Minions', lines);
    }
    // Evil Travellers learn the Demon under either policy.
    if (r.typeOf(id) === 'traveller' && r.alignmentOf(id) === 'evil') {
      run.deliver(id, 'starting', 'The Demon', [`The Demon is: ${demons.map(r.name).join(', ')}.`]);
    }
  }
}
