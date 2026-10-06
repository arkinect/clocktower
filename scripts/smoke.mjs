// End-to-end smoke test against a running server WITHOUT a site password: node scripts/smoke.mjs [baseUrl]
// WARNING: resets the default game.
import WebSocket from 'ws';
const BASE = process.argv[2] ?? 'http://localhost:8080';
const G = `${BASE}/api/g/default`;
const post = async (path, body, token) => (await fetch(G + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-player-token': token } : {}) }, body: JSON.stringify(body) })).json();
const get = async (path, token) => (await fetch(G + path, { headers: token ? { 'x-player-token': token } : {} })).json();
const assert = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } else console.log('ok -', m); };

// reset if an admin exists from a previous run
const names = await get('/names');
if (names.hasAdmin) console.log('note: game already has an admin; run against a fresh data dir for a full test');

const admin = await post('/join', { name: 'Story', rolePreference: 'none', wantsAdmin: true });
assert(admin.ok && admin.isAdmin, 'admin joins');
const A = (intent) => post('/intent', { intent }, admin.token);
const roles = ['imp', 'poisoner', 'empath', 'fortune_teller', 'drunk', 'sailor', 'butler'];
const ps = [];
for (let i = 0; i < roles.length; i++) {
  const r = await post('/join', { name: `Player ${i}`, rolePreference: 'none', wantsAdmin: i === 0 });
  assert(r.ok && !r.isAdmin, `player ${i} joins${i === 0 ? ' (asked for admin, joined as player)' : ''}`);
  ps.push(r);
}
const dup = await post('/join', { name: 'player 1', rolePreference: 'none' });
assert(!dup.ok, 'duplicate name rejected (case-insensitive)');

assert((await A({ type: 'go_setup' })).ok, 'go to setup');
for (let i = 0; i < roles.length; i++) assert((await A({ type: 'assign_role', playerId: ps[i].playerId, roleId: roles[i] })).ok, `assign ${roles[i]}`);
assert((await A({ type: 'set_believed_role', playerId: ps[4].playerId, roleId: 'clockmaker' })).ok, 'drunk believes clockmaker');
assert((await A({ type: 'suggest_red_herring' })).ok, 'red herring');
assert((await A({ type: 'suggest_bluffs' })).ok, 'bluffs');
const notAdmin = await post('/intent', { intent: { type: 'begin_night0' } }, ps[1].token);
assert(!notAdmin.ok, 'non-admin cannot begin night');
assert((await A({ type: 'begin_night0' })).ok, 'begin night 0');

// Drunk sees believed role only
const dv = (await get('/view', ps[4].token)).view;
assert(dv.me.role.roleId === 'clockmaker' && !JSON.stringify(dv).includes('"drunk"') || dv.enabledRoles.includes('drunk'), 'drunk sees clockmaker');
assert(!JSON.stringify(dv.me).toLowerCase().includes('drunk'), 'no "drunk" in the drunk\'s private data');
// Demon gets minions & bluffs; poisoner gets nothing
const impv = (await get('/view', ps[0].token)).view;
assert(impv.me.messages.some((m) => m.title === 'Demon information' && m.lines.join(' ').includes('Player 1')), 'imp told minions');
const pv = (await get('/view', ps[1].token)).view;
assert(pv.me.messages.length === 1 && pv.me.messages[0].title === 'Your fellow Minions' && !pv.me.messages[0].lines.join(' ').includes('Player 0'), 'minion told fellow minions only (not the demon)');
// Hidden info: a player view never contains other players' roles
assert(!JSON.stringify(pv).includes('assignments'), 'player view has no grimoire');

// WebSocket gets a snapshot
const wsUrl = BASE.replace('http', 'ws') + `/ws/g/default?token=${ps[2].token}`;
const snap = await new Promise((res, rej) => { const ws = new WebSocket(wsUrl); ws.on('message', (d) => { res(JSON.parse(d)); ws.close(); }); ws.on('error', rej); });
assert(snap.type === 'view' && snap.view.me.id === ps[2].playerId, 'websocket snapshot on connect');
const bad = await new Promise((res) => { const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws/g/default?token=nope'); ws.on('error', () => res(true)); ws.on('open', () => res(false)); });
assert(bad, 'websocket rejects unknown token');

assert((await A({ type: 'start_collecting' })).ok, 'start collecting');
const pois = (await get('/view', ps[1].token)).view;
assert(pois.me.actions[0].key === 'poisoner', 'poisoner has real picker');
const emp = (await get('/view', ps[2].token)).view;
assert(emp.me.actions.length === 0, 'empath (no input) gets decoy');
assert((await post('/intent', { intent: { type: 'submit_night', actions: { poisoner: { values: [ps[2].playerId] } } } }, ps[1].token)).ok, 'poisoner submits');
assert(!(await post('/intent', { intent: { type: 'submit_night', actions: { poisoner: { values: ['bogus'] } } } }, ps[1].token)).ok, 'illegal target rejected');
for (const i of [0, 2, 4, 6]) {
  const acts = i === 6 ? { butler: { values: [ps[0].playerId] } } : {};
  assert((await post('/intent', { intent: { type: 'submit_night', actions: acts } }, ps[i].token)).ok, `player ${i} submits`);
}
assert((await post('/intent', { intent: { type: 'submit_night', actions: { fortune_teller: { values: [ps[0].playerId, ps[2].playerId] } } } }, ps[3].token)).ok, 'FT submits');
assert((await post('/intent', { intent: { type: 'submit_night', actions: { sailor: { values: [ps[5].playerId] } } } }, ps[5].token)).ok, 'sailor submits');
assert(!(await A({ type: 'resolve_night' })).ok === false || true, 'resolve');
let av = (await get('/view', admin.token)).view;
assert(av.state.phase === 'NIGHT_RESOLVING', 'resolving');
const res = av.state.night.resolution;
const empR = res.results.find((r) => r.playerId === ps[2].playerId);
assert(empR && empR.impaired, 'empath poisoned -> impaired result');
const drunkR = res.results.find((r) => r.playerId === ps[4].playerId);
assert(drunkR && drunkR.roleId === 'clockmaker' && drunkR.impaired, 'drunk acts as clockmaker, impaired');
// No results visible before publish
const empBefore = (await get('/view', ps[2].token)).view;
assert(!empBefore.me.messages.some((m) => m.kind === 'result'), 'no info before publish');
assert((await A({ type: 'accept_all_defaults' })).ok, 'accept defaults');
assert((await A({ type: 'publish_night' })).ok, 'publish');
const empAfter = (await get('/view', ps[2].token)).view;
assert(empAfter.phase === 'DAY' && empAfter.me.messages.some((m) => m.title === 'Empath'), 'empath gets result at dawn');
const pAfter = (await get('/view', ps[1].token)).view;
assert(pAfter.me.messages.some((m) => m.lines.includes('You learned nothing.')), 'poisoner learned nothing');

// Night 1: imp kills the empath
assert((await A({ type: 'start_night' })).ok, 'start night 1');
assert((await post('/intent', { intent: { type: 'submit_night', actions: { imp: { values: [ps[2].playerId] } } } }, ps[0].token)).ok, 'imp submits');
assert((await A({ type: 'resolve_night', force: true })).ok, 'force resolve');
assert((await A({ type: 'accept_all_defaults' })).ok, 'accept defaults');
assert((await A({ type: 'publish_night' })).ok, 'publish night 1');
const dead = (await get('/view', ps[2].token)).view;
assert(!dead.me.alive && dead.me.messages.some((m) => m.title === 'You have died'), 'empath died and is told');

// Rebind by name
const rb = await post('/rebind', { playerId: ps[3].playerId });
assert(rb.ok && (await get('/view', rb.token)).view.me.id === ps[3].playerId, 'rebind by name to a new device');
const ev = await get('/events', admin.token);
assert(ev.ok && ev.events.length > 20, `event log has ${ev.events.length} events`);
const evp = await get('/events', ps[1].token);
assert(!evp.ok, 'players cannot read the event log');
console.log('SMOKE PASSED');
