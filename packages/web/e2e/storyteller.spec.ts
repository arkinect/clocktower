import { expect, test, type Page } from '@playwright/test';
import { ScriptedPlayer } from './client';

const CAST: [string, string][] = [
  ['Ann', 'Balloonist'],
  ['Bo', 'Slayer'],
  ['Cy', 'Empath'],
  ['Di', 'Poisoner'],
  ['Ed', 'Imp'],
];

/** A tab in the strip, or under More once the game has started. */
async function tab(page: Page, name: string) {
  const link = page.getByRole('navigation', { name: 'Console sections' }).getByRole('link', { name, exact: true });
  if (await link.count()) return link.click();
  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function closeNight(page: Page) {
  await expect(page.getByRole('button', { name: 'Close the night' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close the night' }).click();
  await expect(page.getByRole('heading', { name: 'What each player learns' })).toBeVisible();
}

/** Picks an option in a Review decision's dropdown, by the start of its label. */
async function decide(page: Page, label: string) {
  const select = page.locator('select', { has: page.locator('option', { hasText: label }) });
  const value = await select.locator('option', { hasText: label }).getAttribute('value');
  await select.selectOption(value as string);
  await expect(select).toHaveValue(value as string);
}

test('from the lobby to publishing night 2, with a changed decision, a written answer and an execution', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1000, height: 800 });

  // Lobby.
  await page.goto('/g/console');
  await page.getByLabel('Your name').fill('Storyteller');
  await page.getByLabel('I am the Storyteller').check();
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page).toHaveURL(/\/g\/console\/storyteller/);
  await expect(page.getByAltText('Join QR code')).toBeVisible();
  const [ann, bo, cy, di, ed] = await Promise.all(CAST.map(([n]) => ScriptedPlayer.join('console', n)));
  const players = [ann, bo, cy, di, ed] as ScriptedPlayer[];
  await expect(page.getByRole('heading', { name: 'Players (5)' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to setup' }).click();

  // Setup, by hand.
  await expect(page).toHaveURL(/storyteller\/setup/);
  await page.getByRole('button', { name: 'All roles' }).click();
  await expect(page.getByRole('heading', { name: /Script \(\d\d roles\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Randomise' }).click();
  await page.getByRole('button', { name: 'Publish to phones' }).click();
  for (const [name, role] of CAST) {
    await page.getByLabel(`Character for ${name}`).selectOption({ label: role });
  }
  // No Outsider in this cast, so the Balloonist adds none.
  await page.getByLabel('Balloonist: Outsiders +0 or +1').selectOption('+0');
  await page.getByRole('button', { name: 'Suggest bluffs' }).click();
  await expect(page.getByLabel('Bluff 3')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Begin Night 0' }).click();

  // Night 0.
  await expect(page).toHaveURL(/storyteller\/night/, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Open the night' }).click();
  // The Poisoner stays off the Balloonist, whose decision the test depends on.
  for (const p of players) await p.submit((o) => o === ed?.id);
  await closeNight(page);
  // The Balloonist shows one character type a night. Spending the Minion and the Demon first leaves a real choice.
  await decide(page, 'Di (minion)');
  await page.getByRole('button', { name: 'Publish dawn' }).click();

  // Day 1: a day event that happens now, previewed as it is chosen, then an execution.
  await expect(page).toHaveURL(/storyteller\/day/);
  const action = page.getByRole('article').filter({ hasText: 'Slayer' });
  await action.locator('select').selectOption({ label: 'Cy' });
  await expect(action.getByText('Cy is not the Demon: nothing happens.')).toBeVisible();
  await action.getByRole('button', { name: 'Use' }).click();
  // Stays confirmed for the rest of the day: a second press would take it back.
  await expect(action.getByRole('button', { name: 'Use' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel(/^Executed/).selectOption({ label: 'Cy (Empath)' });
  await expect(page.getByText('To be executed')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Start Night 1' }).click();
  await cy?.waitFor((v) => v.phase.kind === 'night' && !v.me.alive);

  // Night 1.
  await expect(page).toHaveURL(/storyteller\/night/, { timeout: 10_000 });
  await ann?.submit();
  await di?.submit((o) => o === bo?.id);
  await ed?.submit((o) => o === bo?.id);
  await bo?.submit();
  await closeNight(page);
  await decide(page, 'Ed (demon)');
  await page.getByRole('button', { name: 'Publish dawn' }).click();
  await expect(page).toHaveURL(/storyteller\/day/);
  await page.getByRole('button', { name: 'Start Night 2' }).click();

  // Night 2: only a drunk or poisoned player's result is on the Review tab, so the Poisoner takes Ann, and the Imp
  // attacks Bo (already dead) so nobody dies. Write her an answer in place of the suggested false one.
  await expect(page).toHaveURL(/storyteller\/night/, { timeout: 10_000 });
  await ann?.submit();
  await di?.submit((o) => o === ann?.id);
  await ed?.submit((o) => o === bo?.id);
  await closeNight(page);
  const result = page.getByRole('article').filter({ hasText: 'Ann Balloonist' });
  await expect(result.getByText('poisoned')).toBeVisible();
  await result.getByLabel('Answer for Balloonist').selectOption({ label: 'Write an answer…' });
  await page.getByLabel('One line per message line').fill('An answer from the Storyteller');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(result.locator('select option:checked')).toHaveText(/An answer from the Storyteller/);

  // Changing the decision under it keeps the written answer.
  const decision = page.getByRole('combobox', { name: /Balloonist Ann.*show which player/ });
  const current = await decision.inputValue();
  const values = await decision.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  await decision.selectOption(values.find((v) => v && v !== current) as string);
  await expect(result.locator('select option:checked')).toHaveText(/An answer from the Storyteller/);
  await page.getByRole('button', { name: 'Publish dawn' }).click();
  await expect(page).toHaveURL(/storyteller\/day/);
  await ann?.waitFor((v) => v.phase.kind === 'day' && v.phase.n === 3);
  expect(ann?.view?.me.messages.at(-1)?.lines).toEqual(['An answer from the Storyteller']);

  // The other screens render from the same view, even at phone width.
  await page.setViewportSize({ width: 360, height: 720 });
  for (const name of ['Grimoire', 'Story', 'Log', 'Reference', 'Setup', 'Lobby', 'Day']) {
    await tab(page, name);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, name).toBeLessThanOrEqual(360);
  }
  await tab(page, 'Grimoire');
  const seat = page.getByRole('button', { name: /^Seat 1: / });
  await expect(seat).toBeVisible();
  await seat.click();
  await expect(page.getByRole('dialog').getByRole('group', { name: /^Alignment of / })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Change character' }).click();
  await expect(page.getByRole('dialog').getByText(/^Change character of /)).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  const first = await seat.boundingBox();
  const second = await page.getByRole('button', { name: /^Seat 2: / }).boundingBox();
  expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
  expect(second?.y ?? 0).toBeGreaterThan(first?.y ?? 0);
  await tab(page, 'Log');
  await expect(page.getByText('publish dawn').first()).toBeVisible();
  expect(problems).toEqual([]);
});
