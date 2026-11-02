// Builds the v5 saved-game fixtures by running the engine of the withdrawn release v0.3.0 (commit 9606d63, schema v5:
// the enabledRoles map plus the Fisherman, Zealot, Organ Grinder and Baron), with fixed seeds and timestamps so the
// files are stable. To rebuild them:
//   git worktree add --detach ../ct-v030 9606d63 && cd ../ct-v030 && npm ci
//   cp <this repo>/server/test/fixtures/generate-v5.ts server/test/fixtures/
//   npx tsx server/test/fixtures/generate-v5.ts <this repo>/server/test/fixtures
import fs from 'fs';
import path from 'path';
import type { ActionChoice, GameState, Intent } from '@ct/shared';
import { applyIntent, createGame, joinPlayer } from '../../src/engine/game';

const ROLES = ['imp', 'baron', 'organ_grinder', 'empath', 'fortune_teller', 'butler', 'sailor'];
const SEED = 42;

let now = 0;
// The v0.3.0 engine reads Date.now() in a few places; pin it to the fake clock.
Date.now = () => now;

function play(stopMidDay: boolean): GameState {
  now = 2_000_000;
  let s = createGame('fixture', now);
  const join = (name: string, wantsAdmin: boolean) => {
    const r = joinPlayer(s, { name, rolePreference: 'none', wantsAdmin }, `tok-${name}`, now++);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    return r.player.id;
  };
  const admin = join('Storyteller', true);
  const ids = ROLES.map((r, i) => join(`P${i}`, false));
  const p = Object.fromEntries(ROLES.map((r, i) => [r, ids[i]]));
  const act = (intent: Intent, actor = admin) => {
    const r = applyIntent(s, actor, intent, { now: now++, seed: SEED });
    if (!r.ok) throw new Error(`${intent.type}: ${r.error}`);
    s = r.state;
  };
  const submit = (pid: string, key: string, values: string[]) => {
    const actions: Record<string, ActionChoice> = { [key]: { values } };
    act({ type: 'submit_night', actions }, pid);
  };

  act({ type: 'go_setup' });
  act({ type: 'set_seating', order: ids });
  ROLES.forEach((r, i) => act({ type: 'assign_role', playerId: ids[i], roleId: r }));
  act({ type: 'set_red_herring', playerId: p.empath });
  act({ type: 'set_bluffs', roleIds: ['fisherman', 'clockmaker', 'mayor'] });
  act({ type: 'begin_night0' });
  act({ type: 'start_collecting' });
  submit(p.organ_grinder, 'organ_grinder', [p.organ_grinder]); // drunk until dusk: an effect caused by the Organ Grinder
  act({ type: 'resolve_night', force: true });
  act({ type: 'publish_night', force: true });
  if (stopMidDay) return s; // DAY 1, the Organ Grinder's effect still in place

  act({ type: 'start_night' });
  submit(p.organ_grinder, 'organ_grinder', [p.organ_grinder]);
  submit(p.imp, 'imp', [p.empath]);
  act({ type: 'resolve_night', force: true });
  act({ type: 'publish_night', force: true });
  act({ type: 'end_game' });
  return s;
}

const out = process.argv[2];
if (!out) throw new Error('usage: generate-v5.ts <output dir>');
for (const [name, s] of [['v5-ended', play(false)], ['v5-mid-day', play(true)]] as const) {
  if (s.schemaVersion !== 5) throw new Error(`expected schema v5, got v${s.schemaVersion}: run this at 9606d63`);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(s, null, 2) + '\n');
  console.log(`${name}: ${s.phase}`);
}
