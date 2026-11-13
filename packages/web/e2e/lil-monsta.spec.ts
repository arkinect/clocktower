// Lil' Monsta games, for screenshots of who babysits, who is told, and a busy Review tab.
// Screenshots only: they open two more games than the server's live-game limit leaves for the other specs, so they
// skip unless asked for. Run with: SHOTS=1 npx playwright test lil-monsta (after npm run build). Pictures: screenshots/.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { WebSocket } from 'ws';
import type { StorytellerView } from '@ct/protocol';
import { BASE, ScriptedPlayer, ScriptedStoryteller } from './client';

test.skip(!process.env['SHOTS'], 'Screenshots only: run with SHOTS=1.');

const CODE = 'monsta';
const CAST: [string, string][] = [
  ['Ann', 'lil_monsta'],
  ['Bo', 'scarlet_woman'],
  ['Cy', 'empath'],
  ['Di', 'clockmaker'],
  ['Ed', 'farmer'],
  ['Fi', 'virgin'],
  ['Gus', 'slayer'],
];
const SHOT = (name: string) => `../../screenshots/lil-monsta-${name}.png`;

async function storyteller() {
  const res = await fetch(`${BASE}/api/g/${CODE}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Storyteller', wantsStoryteller: true }),
  });
  const { playerId } = (await res.json()) as { playerId: string };
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { origin: BASE, cookie } });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { st: new ScriptedStoryteller(ws, playerId), cookie };
}

async function phone(browser: Browser, name: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`/g/${CODE}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible();
  return page;
}

/** The night ends with the Storyteller's choice of victim (or nobody) and everything else at its default. */
async function close(st: ScriptedStoryteller) {
  if (st.view?.phase.stage === 'collecting') await st.do({ type: 'close_collecting', force: true }).catch(() => {});
}

async function closeNight(st: ScriptedStoryteller, victim: string | null) {
  await close(st);
  const v = await st.waitFor((x) => x.phase.stage === 'review' && !!x.review);
  const d = (v.review as NonNullable<StorytellerView['review']>).decisions.find((x) => x.key.kind === 'lil_monsta');
  if (d) await st.do({ type: 'decide', key: d.key, option: victim ? st.player(victim) : 'none' });
  await st.do({ type: 'accept_all_defaults' });
}

/** Ann is also the Poisoner, so her night action asks for both: she poisons Gus each night. */
async function chooseBabysitter(page: Page, name: string) {
  await page.getByRole('button', { name: 'Night action' }).click();
  const dialog = page.getByRole('dialog');
  const selects = dialog.locator('select');
  for (let i = 0; i < (await selects.count()); i++) await selects.nth(i).selectOption({ label: 'Gus' });
  await dialog.getByLabel('Babysitter').selectOption({ label: name });
  return dialog;
}

test("Lil' Monsta: who babysits, and who is told", async ({ browser }) => {
  test.setTimeout(180_000);
  const { st, cookie } = await storyteller();
  const pages: Record<string, Page> = {};
  for (const [name] of CAST) pages[name] = await phone(browser, name);
  const { Ann: ann, Bo: bo, Cy: cy } = pages as Record<'Ann' | 'Bo' | 'Cy', Page>;
  await st.waitFor((v) => v.players.length >= CAST.length);

  await st.do({ type: 'open_setup' });
  await st.do({
    type: 'set_script',
    roleIds: [...CAST.map(([, r]) => r), 'baron', 'poisoner', 'sailor', 'oracle', 'artist'].map((r) => st.role(r)),
  });
  await st.do({ type: 'randomise_seating' });
  await st.do({ type: 'publish_seating' });
  const assignments: Record<string, string> = {};
  for (const [name, role] of CAST) assignments[st.player(name)] = st.role(role);
  await st.do({ type: 'assign_many', assignments: assignments as never });
  const set = await st.waitFor((v) => v.setup.fields.some((f) => f.field === 'minion'));
  const field = set.setup.fields.find((f) => f.field === 'minion');
  await st.do({ type: 'set_setup_field', abilityId: field?.abilityId as never, field: 'minion', value: 'poisoner' });
  await st.do({ type: 'begin_first_night', force: true });

  // Night 0: nothing to choose yet. At dawn Ann becomes the Poisoner and babysits the token.
  await st.do({ type: 'open_collecting' });
  await closeNight(st, null);
  await st.do({ type: 'publish_dawn', force: true });
  await st.waitFor((v) => v.phase.kind === 'day');

  // Night 1: Ann chooses Cy, a good player, to babysit.
  await st.do({ type: 'start_night' });
  await st.waitFor((v) => v.phase.stage === 'collecting');
  const dialog = await chooseBabysitter(ann, 'Cy');
  await ann.screenshot({ path: SHOT('1-keeper-chooses'), fullPage: true });
  await dialog.getByRole('button', { name: 'Submit' }).click();

  // The Storyteller chooses who dies: everyone alive but the babysitter, or nobody.
  await close(st);
  await st.waitFor((x) => x.phase.stage === 'review');
  const console_ = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const [cname, cvalue] = cookie.split('=') as [string, string];
  await console_.context().addCookies([{ name: cname, value: cvalue, url: BASE }]);
  await console_.goto(`/g/${CODE}/storyteller/review`);
  await expect(console_.getByRole('combobox', { name: "Lil' Monsta: who dies?" })).toBeVisible();
  await console_.getByText("Lil' Monsta: who dies?").scrollIntoViewIfNeeded();
  await console_.screenshot({ path: SHOT('2-storyteller-chooses-victim') });
  await closeNight(st, 'Di');
  await st.do({ type: 'publish_dawn', force: true });
  await st.waitFor((v) => v.phase.kind === 'day');

  // Day 2: the good babysitter is told nothing; the Scarlet Woman learns who babysits.
  await expect(cy.getByText('Dawn, Day 2')).toBeVisible();
  await expect(cy.getByText(/Demon/)).toHaveCount(0);
  await cy.screenshot({ path: SHOT('3-good-babysitter-told-nothing'), fullPage: true });
  await expect(bo.getByText("Cy is babysitting Lil' Monsta.")).toBeVisible();
  await bo.screenshot({ path: SHOT('4-minion-learns-babysitter'), fullPage: true });

  // Ann is executed. Night 2: dead, she still chooses, and takes the token from Cy to give it to Bo.
  await st.do({ type: 'record_execution', playerId: st.player('Ann') as never, died: true });
  await st.do({ type: 'start_night' });
  await st.waitFor((v) => v.phase.stage === 'collecting');
  const again = await chooseBabysitter(ann, 'Bo');
  await ann.screenshot({ path: SHOT('5-dead-keeper-still-chooses') });
  await again.getByRole('button', { name: 'Submit' }).click();
  await closeNight(st, null);
  await st.do({ type: 'publish_dawn', force: true });
  await st.waitFor((v) => v.phase.kind === 'day');

  // Day 3: Bo, evil, is told who babysits: herself. Cy is never told the token left.
  await expect(bo.getByText("Bo is babysitting Lil' Monsta.")).toBeVisible();
  await bo.screenshot({ path: SHOT('6-evil-babysitter-told'), fullPage: true });
  await expect(cy.getByText(/Demon/)).toHaveCount(0);
  await cy.screenshot({ path: SHOT('7-good-player-not-told-token-left'), fullPage: true });
});

// A busier night, so most of the Review tab is in use: several decisions, results (one poisoned), notices to
// several players, a conversion, and the night's story.
test("Lil' Monsta: a busy Review tab", async ({ page }) => {
  test.setTimeout(180_000);
  const code = 'monsta2';
  const cast: [string, string][] = [
    ['Ann', 'lil_monsta'],
    ['Bo', 'mezepheles'],
    ['Cy', 'empath'],
    ['Di', 'fortune_teller'],
    ['Ed', 'farmer'],
    ['Fi', 'mayor'],
    ['Gus', 'gossip'],
    ['Hal', 'oracle'],
    ['Ivy', 'slayer'],
  ];
  const res = await fetch(`${BASE}/api/g/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Storyteller', wantsStoryteller: true }),
  });
  const { playerId } = (await res.json()) as { playerId: string };
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws`, { headers: { origin: BASE, cookie } });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const st = new ScriptedStoryteller(ws, playerId);
  const players = Object.fromEntries(
    await Promise.all(cast.map(async ([name]) => [name, await ScriptedPlayer.join(code, name)] as const)),
  );
  await st.waitFor((v) => v.players.length >= cast.length);

  await st.do({ type: 'open_setup' });
  await st.do({
    type: 'set_script',
    roleIds: [...cast.map(([, r]) => r), 'poisoner', 'baron', 'sailor', 'artist'].map((r) => st.role(r)),
  });
  await st.do({ type: 'randomise_seating' });
  await st.do({ type: 'publish_seating' });
  const assignments: Record<string, string> = {};
  for (const [name, role] of cast) assignments[st.player(name)] = st.role(role);
  await st.do({ type: 'assign_many', assignments: assignments as never });
  const set = await st.waitFor((v) => v.setup.fields.length >= 3);
  const setField = async (field: string, value: string) => {
    const f = set.setup.fields.find((x) => x.field === field);
    await st.do({ type: 'set_setup_field', abilityId: f?.abilityId as never, field, value });
  };
  await setField('minion', 'poisoner');
  await setField('word', 'apple');
  await setField('herring', st.player('Ivy'));
  await st.do({ type: 'begin_first_night', force: true });
  await st.do({ type: 'open_collecting' });
  await closeNight(st, null);
  await st.do({ type: 'publish_dawn', force: true });
  await st.waitFor((v) => v.phase.kind === 'day');

  // Day 1: Hal says the Mezepheles word, and the Gossip's statement was true.
  const day = await st.waitFor((v) => v.dayActions.some((d) => d.roleId === 'mezepheles'));
  const act = async (role: string, values: string[]) => {
    const d = day.dayActions.find((x) => x.roleId === role);
    await st.do({
      type: 'day_action',
      abilityId: d?.abilityId as never,
      action: d?.action as string,
      values,
      mode: 'accept',
    });
  };
  await act('mezepheles', [st.player('Hal')]);
  await act('gossip', ['true']);

  // Night 1: Ann poisons Di (the Fortune Teller) and gives the token to Bo.
  await st.do({ type: 'start_night' });
  const night = await players['Ann']!.waitFor((v) => v.phase.stage === 'collecting' && v.me.actions.length >= 2);
  const actions: Record<string, { values: string[] }> = {};
  for (const spec of night.me.actions) {
    actions[spec.key] = { values: [spec.roleId === 'poisoner' ? st.player('Di') : st.player('Bo')] };
  }
  await players['Ann']!.do({ type: 'submit_night', actions });
  await players['Di']!.submit((o) => o === st.player('Ann') || o === st.player('Cy'));
  await close(st);
  await st.waitFor((v) => v.phase.stage === 'review' && !!v.review);

  // The Storyteller kills the Farmer (Ed); the Gossip's statement kills the Mayor (Fi).
  const decide = async (kind: string, name: string) => {
    const v = await st.waitFor((x) => !!x.review?.decisions.some((d) => d.key.kind === kind));
    const d = v.review?.decisions.find((x) => x.key.kind === kind);
    await st.do({ type: 'decide', key: d?.key as never, option: st.player(name) });
  };
  await decide('lil_monsta', 'Ed');
  await decide('gossip_victim', 'Fi');

  const [name, value] = cookie.split('=') as [string, string];
  await page.context().addCookies([{ name, value, url: BASE }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/g/${code}/storyteller/review`);
  await expect(page.getByRole('combobox', { name: "Lil' Monsta: who dies?" })).toBeVisible();
  await page.screenshot({ path: SHOT('8-busy-review'), fullPage: true });
});
