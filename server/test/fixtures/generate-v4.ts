// Builds the v4 saved-game fixtures by running the engine of release v0.2.2 (schema v4), with fixed seeds and
// timestamps so the files are stable. To rebuild them:
//   git worktree add ../ct-v022 v0.2.2 && cd ../ct-v022 && npm ci
//   cp <this repo>/server/test/fixtures/generate-v4.ts server/test/fixtures/
//   npx tsx server/test/fixtures/generate-v4.ts <this repo>/server/test/fixtures
import fs from 'fs';
import path from 'path';
import type { ActionChoice, GameState, Intent } from '@ct/shared';
import { applyIntent, createGame, joinPlayer } from '../../src/engine/game';

const ROLES = ['imp', 'poisoner', 'empath', 'ravenkeeper', 'fortune_teller', 'butler', 'sailor'];
const SEED = 42;

let now = 0;
// The v0.2.2 engine reads Date.now() in a few places; pin it to the fake clock.
Date.now = () => now;

function play(stopMidNight: boolean): GameState {
  now = 1_000_000;
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
  act({ type: 'suggest_bluffs' });
  act({ type: 'begin_night0' });
  act({ type: 'start_collecting' });
  submit(p.poisoner, 'poisoner', [p.empath]);
  act({ type: 'resolve_night', force: true });
  act({ type: 'publish_night', force: true });

  act({ type: 'start_night' });
  submit(p.poisoner, 'poisoner', [p.sailor]);
  submit(p.imp, 'imp', [p.ravenkeeper]);
  act({ type: 'resolve_night', force: true });
  if (stopMidNight) return s; // NIGHT_RESOLVING, the Ravenkeeper's second round not yet answered
  act({ type: 'publish_night', force: true });
  act({ type: 'end_game' });
  return s;
}

const out = process.argv[2];
if (!out) throw new Error('usage: generate-v4.ts <output dir>');
for (const [name, s] of [['v4-ended', play(false)], ['v4-mid-night', play(true)]] as const) {
  if (s.schemaVersion !== 4) throw new Error(`expected schema v4, got v${s.schemaVersion}: run this at v0.2.2`);
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(s, null, 2) + '\n');
  console.log(`${name}: ${s.phase}`);
}
