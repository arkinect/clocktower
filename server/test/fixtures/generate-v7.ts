// Builds the v7 saved-game fixtures by running the engine of commit b9d25f0 (schema v7: the script as a list, follow-up
// questions, the Philosopher's gained Grandmother marked by roleState.grandmotherInfoPending), with fixed seeds and
// timestamps so the files are stable. To rebuild them:
//   git worktree add --detach ../ct-v7 b9d25f0 && cd ../ct-v7 && npm ci
//   cp <this repo>/server/test/fixtures/generate-v7.ts server/test/fixtures/
//   npx tsx server/test/fixtures/generate-v7.ts <this repo>/server/test/fixtures
import fs from 'fs';
import path from 'path';
import type { ActionChoice, GameState, Intent } from '@ct/shared';
import { applyIntent, createGame, joinPlayer } from '../../src/engine/game';

const ROLES = ['imp', 'poisoner', 'philosopher', 'grandmother', 'empath', 'ravenkeeper', 'butler'];
const SEED = 42;

let now = 0;
Date.now = () => now;

function play(stopMidDay: boolean): GameState {
  now = 3_000_000;
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
  act({ type: 'set_bluffs', roleIds: ['clockmaker', 'mayor', 'oracle'] });
  act({ type: 'begin_night0' });
  act({ type: 'start_collecting' });
  submit(p.philosopher, 'philosopher', ['grandmother']); // gained from night 1: grandmotherInfoPending, the Grandmother drunk
  submit(p.poisoner, 'poisoner', [p.empath]);
  submit(p.butler, 'butler', [p.empath]);
  act({ type: 'resolve_night', force: true });
  act({ type: 'publish_night', force: true });
  if (stopMidDay) return s; // DAY 1, the Philosopher's Grandmother info still pending

  act({ type: 'start_night' });
  submit(p.poisoner, 'poisoner', [p.butler]);
  submit(p.imp, 'imp', [p.ravenkeeper]);
  submit(p.butler, 'butler', [p.empath]);
  act({ type: 'resolve_night', force: true });
  act({ type: 'answer_follow_up_for', key: `ravenkeeper:${p.ravenkeeper}`, choice: { values: [p.imp] } });
  act({ type: 'publish_night', force: true });
  act({ type: 'record_execution', playerId: p.poisoner, died: true });
  act({ type: 'end_game' });
  return s;
}

const out = process.argv[2];
if (!out) throw new Error('usage: generate-v7.ts <output dir>');
for (const [name, s] of [['v7-ended', play(false)], ['v7-mid-day', play(true)]] as const) {
  if (s.schemaVersion !== 7) throw new Error(`expected schema v7, got v${s.schemaVersion}: run this at b9d25f0`);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(s, null, 2) + '\n');
  console.log(`${name}: ${s.phase}`);
}
