import { expect, test, type Browser, type Page } from '@playwright/test';
import type { RoleId } from '@ct/protocol';
import { ScriptedStoryteller as Scripted } from './client';

const NAMES = ['Ann', 'Bo', 'Cy', 'Di', 'Ed'];
const ROLES = ['clockmaker', 'farmer', 'empath', 'poisoner', 'imp'];

async function phone(browser: Browser, code: string, name: string, colorScheme: 'dark' | 'light', problems: string[]) {
  const context = await browser.newContext({ viewport: { width: 360, height: 720 }, colorScheme });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${name}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`));
  await page.goto(`/g/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page.getByRole('heading', { name: `Welcome, ${name}` })).toBeVisible();
  return page;
}

const noSideScroll = async (page: Page) => {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
};

/** Answers whatever the phone asks tonight, the way a player would. */
async function act(page: Page) {
  const action = page.getByRole('button', { name: 'Night action' });
  const carryOn = page.getByRole('button', { name: 'Continue' });
  await expect(action.or(carryOn)).toBeVisible();
  if (await carryOn.isVisible()) {
    await carryOn.click();
  } else {
    await action.click();
    const dialog = page.getByRole('dialog');
    const selects = dialog.locator('select');
    for (let i = 0; i < (await selects.count()); i++) {
      const value = await selects.nth(i).locator('option:not([disabled])').nth(1).getAttribute('value');
      await selects.nth(i).selectOption(value as string);
    }
    await dialog.getByRole('button', { name: 'Submit' }).click();
  }
  await expect(page.getByText('Submitted. Waiting for everyone.')).toBeVisible();
}

test('five phones and a scripted Storyteller play a full game', async ({ browser }) => {
  const problems: string[] = [];
  const st = await Scripted.join('five');
  const pages: Page[] = [];
  for (const [i, name] of NAMES.entries()) {
    pages.push(await phone(browser, 'five', name, i % 2 ? 'light' : 'dark', problems));
  }
  const [ann, bo, , di] = pages as [Page, Page, Page, Page, Page];
  await st.waitFor((v) => v.players.length >= 5);
  await st.do({ type: 'open_setup' });
  await st.do({
    type: 'set_script',
    roleIds: [...ROLES, 'sailor', 'virgin', 'slayer', 'oracle'].map((r) => st.role(r)),
  });
  await st.do({ type: 'randomise_seating' });
  await st.do({ type: 'publish_seating' });
  const assignments: Record<string, RoleId> = {};
  NAMES.forEach((n, i) => {
    assignments[st.player(n)] = st.role(ROLES[i] as string);
  });
  await st.do({ type: 'assign_many', assignments });
  await st.do({ type: 'suggest_bluffs' });
  await st.do({ type: 'begin_first_night', force: true });

  for (const page of pages) {
    await expect(page.getByRole('heading', { name: 'Night 0 begins' })).toBeVisible();
    await noSideScroll(page);
    // The Night tab only says where the role is; it never shows the role itself.
    await expect(page.getByRole('button', { name: 'Tap to reveal your role' })).toHaveCount(0);
    await expect(page.getByText('Wait for the Storyteller to start the night.')).toBeVisible();
  }
  await ann.getByRole('button', { name: 'My role' }).click();
  await ann.getByRole('button', { name: 'Tap to reveal your role' }).click();
  await expect(ann.getByText('Clockmaker', { exact: true })).toBeVisible();
  await ann.getByRole('button', { name: 'Night', exact: true }).click();

  // The other tabs read from the view and the catalog.
  await bo.getByRole('button', { name: 'Roles' }).click();
  await expect(bo.getByText('Sailor', { exact: true })).toBeVisible();
  await noSideScroll(bo);
  await bo.getByRole('button', { name: 'Order' }).click();
  await expect(bo.getByRole('heading', { name: 'Night order' })).toBeVisible();
  await bo.getByRole('button', { name: 'Seats' }).click();
  await expect(bo.getByText('The circle closes')).toBeVisible();
  await bo.getByRole('button', { name: 'Night', exact: true }).click();

  // The games stay out of the page until a player has finished.
  const chunks: string[] = [];
  ann.on('request', (r) => chunks.push(r.url()));
  await st.do({ type: 'open_collecting' });
  await expect(ann.getByText('The games unlock once you are done.')).toBeVisible();
  expect(chunks.some((u) => u.includes('NightGames'))).toBe(false);
  await noSideScroll(ann);
  for (const page of pages) await act(page);
  await expect(ann.getByRole('button', { name: 'Lantern Slice' })).toBeVisible();
  expect(chunks.some((u) => u.includes('NightGames'))).toBe(true);
  await ann.getByRole('button', { name: '2048' }).click();
  await expect(ann.getByText('Swipe to slide the tiles')).toBeVisible();
  await noSideScroll(ann);

  await st.do({ type: 'close_collecting', force: true });
  await st.waitFor((v) => v.phase.stage === 'review');
  await st.do({ type: 'accept_all_defaults' });
  await st.do({ type: 'publish_dawn', force: true });
  for (const page of pages) await expect(page.getByText('Dawn, Day 1')).toBeVisible();
  await noSideScroll(ann);

  // Executed as the night starts.
  await st.do({ type: 'record_execution', playerId: st.player('Di'), died: true });
  await st.do({ type: 'start_night' });
  await st.waitFor((v) => v.phase.kind === 'night');
  for (const [i, page] of pages.entries()) {
    if (i !== 3) await act(page);
  }
  await st.do({ type: 'close_collecting', force: true });
  await st.waitFor((v) => v.phase.stage === 'review');
  await st.do({ type: 'accept_all_defaults' });
  await st.do({ type: 'publish_dawn', force: true });
  await expect(ann.getByText('Dawn, Day 2')).toBeVisible();
  await expect(di.getByText('You have died.')).toBeVisible();
  await di.getByRole('button', { name: 'I used my vote' }).click();
  await expect(di.getByText('You have used your vote.')).toBeVisible();

  await st.do({ type: 'record_execution', playerId: st.player('Ed'), died: true });
  await st.do({ type: 'start_night' });
  const end = await st.waitFor((v) => v.gameEnd.length > 0);
  await st.do({ type: 'confirm_game_end', key: (end.gameEnd[0] as { key: string }).key });
  for (const page of pages) await expect(page.getByText('Good wins.')).toBeVisible();
  expect(problems).toEqual([]);
});

test('reload keeps the session, and tabs work from the keyboard', async ({ browser }) => {
  const problems: string[] = [];
  const st = await Scripted.join('keys');
  const page = await phone(browser, 'keys', 'Kim', 'dark', problems);
  await st.waitFor((v) => v.players.length >= 1);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome, Kim' })).toBeVisible();
  await page.getByRole('button', { name: 'Roles' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: "Roles in this game's script" })).toBeVisible();
  expect(problems).toEqual([]);
});

test('joining by keyboard and rejoining from the name list', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 720 } });
  const page = await context.newPage();
  await page.goto('/g/keys');
  await page.getByLabel('Your name').focus();
  await page.keyboard.type('Lee');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Welcome, Lee' })).toBeVisible();

  const other = await (await browser.newContext({ viewport: { width: 360, height: 720 } })).newPage();
  await other.goto('/g/keys');
  await other.getByRole('button', { name: "I'm already in this game" }).click();
  await other.getByRole('button', { name: 'Lee' }).click();
  await expect(other.getByRole('heading', { name: 'Welcome, Lee' })).toBeVisible();
});
