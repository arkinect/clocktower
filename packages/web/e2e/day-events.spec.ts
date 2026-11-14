// A game with every day event on the Day tab at once, for a screenshot of the list.
// It runs with the other specs as a check of the list. The pictures are written only when asked for:
// SHOTS=1 npx playwright test day-events (after npm run build). They go to screenshots/.
import { expect, test } from '@playwright/test';
import { WebSocket } from 'ws';
import { BASE, ScriptedPlayer, ScriptedStoryteller } from './client';

// The server's always-present default game: the server allows 4 live games, and the other specs already use the other 3.
const CODE = 'default';
const CAST: [string, string][] = [
  ['Ann', 'gossip'],
  ['Bo', 'juggler'],
  ['Cy', 'slayer'],
  ['Di', 'psychopath'],
  ['Ed', 'damsel'],
  ['Fi', 'mezepheles'],
  ['Gus', 'witch'],
  ['Hal', 'virgin'],
  ['Ivy', 'golem'],
  ['Jo', 'flowergirl'],
  ['Kai', 'moonchild'],
  ['Lu', 'cannibal'],
  ['Mo', 'empath'],
  ['Ned', 'imp'],
];

/** The Storyteller as a script, keeping the cookie so the browser can open the same console. */
async function storyteller() {
  const res = await fetch(`${BASE}/api/g/${CODE}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Storyteller', wantsStoryteller: true }),
  });
  const { playerId } = (await res.json()) as { playerId: string };
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { origin: BASE, cookie } });
  // Listen before the socket opens: the server sends the welcome (with the role catalog) straight away.
  const st = new ScriptedStoryteller(ws, playerId);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { st, cookie };
}

test('the Day tab with every day event', async ({ page }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));
  const { st, cookie } = await storyteller();
  const players = await Promise.all(CAST.map(([name]) => ScriptedPlayer.join(CODE, name)));
  await st.waitFor((v) => v.players.length >= CAST.length);

  // Setup: these characters, seated and assigned, then Night 0.
  await st.do({ type: 'open_setup' });
  // Spare good characters out of play, for the bluffs and the Cannibal's false information.
  const spare = ['sailor', 'clockmaker', 'oracle', 'artist'];
  await st.do({ type: 'set_script', roleIds: [...CAST.map(([, role]) => role), ...spare].map((r) => st.role(r)) });
  await st.do({ type: 'randomise_seating' });
  await st.do({ type: 'publish_seating' });
  const assignments: Record<string, string> = {};
  for (const [name, role] of CAST) assignments[st.player(name)] = st.role(role);
  await st.do({ type: 'assign_many', assignments: assignments as never });
  await st.do({ type: 'suggest_bluffs' });
  await st.do({ type: 'begin_first_night', force: true });

  // Night 0: the Witch curses Hal (the Virgin). Nobody else needs to act.
  await st.do({ type: 'open_collecting' });
  const witch = players[CAST.findIndex(([, role]) => role === 'witch')] as ScriptedPlayer;
  await witch.submit((o) => o === st.player('Hal'));
  await st.do({ type: 'close_collecting', force: true });
  await st.waitFor((v) => v.phase.stage === 'review');
  await st.do({ type: 'publish_dawn', force: true });
  await st.waitFor((v) => v.phase.kind === 'day');

  // Day 1: the Moonchild has died (so they choose today), and the Witch is set to be executed (so the Cannibal eats
  // an evil player). One Juggler guess is recorded to show a filled row.
  await st.do({ type: 'mark_alive', playerId: st.player('Kai') as never, alive: false });
  await st.do({ type: 'record_execution', playerId: st.player('Gus') as never, died: true });
  const juggler = await st.waitFor((v) => v.dayActions.some((d) => d.roleId === 'juggler'));
  const guesses = juggler.dayActions.find((d) => d.roleId === 'juggler');
  await st.do({
    type: 'day_action',
    abilityId: guesses?.abilityId as never,
    action: 'guesses',
    values: [st.player('Ned'), st.role('imp')],
    mode: 'accept',
  });
  await st.waitFor((v) => v.dayActions.length >= 12);

  // The console, as the Storyteller sees it.
  const [name, value] = cookie.split('=') as [string, string];
  await page.context().addCookies([{ name, value, url: BASE }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/g/${CODE}/storyteller/day`);
  const events = page.getByRole('heading', { name: 'Day events' }).locator('xpath=ancestor::section');
  await expect(events.getByRole('article')).toHaveCount(12);
  for (const title of ['Moonchild', 'Gossip', 'Juggler', 'Slayer', 'Psychopath', 'Damsel', 'Mezepheles', 'Witch']) {
    await expect(events.getByRole('heading', { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  for (const title of ['Virgin', 'Golem', 'Flowergirl', 'Cannibal']) {
    await expect(events.getByRole('heading', { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  const shot = async (name: string) => {
    if (process.env['SHOTS']) await page.screenshot({ path: `../../screenshots/${name}.png`, fullPage: true });
  };
  await shot('day-events');
  // The same list at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await shot('day-events-phone');
  expect(problems).toEqual([]);
});
