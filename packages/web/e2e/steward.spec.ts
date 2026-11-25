// A whole autoplay day and night: the steward runs it from the laptop and plays in it, and the others are scripted.
import { expect, test, type Page } from '@playwright/test';
import { STEWARD_BASE, ScriptedPlayer } from './client';

test.use({ baseURL: STEWARD_BASE });

const ROLES = ['Clockmaker', 'Empath', 'Oracle', 'Slayer', 'Virgin', 'Flowergirl', 'Butler', 'Poisoner', 'Imp'];

const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Console sections' }).getByRole('link', { name, exact: true }).click();

/** The steward's own night, whatever they are: the same screen, with or without a choice. */
async function ownNight(page: Page) {
  await tab(page, 'Actions');
  await shot(page, '4b-actions');
  const choices = page.locator('fieldset select');
  for (let i = 0; i < (await choices.count()); i++) {
    const option = choices.nth(i).locator('option:not([disabled]):not([value=""])').last();
    await choices.nth(i).selectOption((await option.getAttribute('value')) as string);
  }
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Nothing to do now.')).toBeVisible();
  await tab(page, 'Night');
}

const shot = (page: Page, name: string) =>
  process.env['SHOTS'] ? page.screenshot({ path: `${process.env['SHOTS']}/${name}.png`, fullPage: true }) : undefined;

test('a steward plays the game they run, from the lobby to night 2 and the story at the end', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));
  await page.setViewportSize({ width: 1000, height: 800 });

  await page.goto('/g/autoplay');
  await page.getByLabel('Your name').fill('Ann');
  await page.getByLabel('I am the Storyteller').check();
  await page.getByRole('button', { name: 'Join game' }).click();
  await expect(page).toHaveURL(/\/g\/autoplay\/storyteller/);

  // One of the others is a real phone.
  const phone = await (
    await browser.newContext({ baseURL: STEWARD_BASE, viewport: { width: 360, height: 720 } })
  ).newPage();
  phone.on('pageerror', (e) => problems.push(e.message));
  await phone.goto('/g/autoplay');
  await phone.getByLabel('Your name').fill('Bo');
  await phone.getByRole('button', { name: 'Join game' }).click();
  const players = await Promise.all(
    ['Cy', 'Di', 'Ed', 'Flo'].map((n) => ScriptedPlayer.join('autoplay', n, STEWARD_BASE)),
  );

  await page.getByRole('button', { name: 'Continue to setup' }).click();
  await expect(page).toHaveURL(/storyteller\/setup/);
  await page.getByRole('button', { name: 'Publish to phones' }).click();
  await page.getByRole('button', { name: 'Suggest characters' }).click();
  await shot(page, '1-storyteller-setup');

  // On, off with everything as it was, and on again: a seat for the steward each time.
  const toggle = page.getByRole('checkbox', { name: 'Autoplay', exact: true });
  await toggle.click();
  await expect(page).toHaveURL(/\/g\/autoplay\/steward\/setup/);
  await expect(page.getByText('You are in seat 6.', { exact: false })).toBeVisible();
  await phone.getByRole('button', { name: 'Seats' }).click();
  await expect(phone.getByText('Ann').first()).toBeVisible();
  await toggle.click();
  await expect(page).toHaveURL(/\/g\/autoplay\/storyteller\/setup/);
  await expect(page.getByLabel('Character for Bo')).not.toHaveValue('');
  await toggle.click();
  await expect(page).toHaveURL(/\/g\/autoplay\/steward\/setup/);
  // The storyteller's address is not theirs any more.
  await page.goto('/g/autoplay/storyteller/grimoire');
  await expect(page).toHaveURL(/\/g\/autoplay\/steward/);
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.getByRole('button', { name: 'Deal characters' })).toBeDisabled();
  for (const role of ROLES) {
    await page.getByRole('checkbox', { name: role, exact: true }).click();
    await expect(page.getByRole('checkbox', { name: role, exact: true })).toBeChecked();
  }
  await expect(page.getByRole('checkbox', { name: 'Artist', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Randomise' }).click();
  await shot(page, '2-setup');
  await page.getByRole('button', { name: 'Deal characters' }).click();

  // Everyone looks at their role. The steward's is on My role, covered.
  await expect(page.getByText('0 of 6 players have looked at their role', { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  await phone.getByRole('button', { name: 'My role' }).click();
  await phone.locator('main button').first().click();
  await expect(page.getByText('1 of 6 players', { exact: false })).toBeVisible();
  await tab(page, 'My role');
  await page.locator('main button').first().click();
  await shot(page, '3-my-role');
  await tab(page, 'Night');
  await expect(page.getByText('2 of 6 players', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Open the night' }).click();

  // Night 0. Nobody is named, and the steward takes their turn like anyone.
  await phone.getByRole('button', { name: 'Night', exact: true }).click();
  await shot(page, '4-night');
  await ownNight(page);
  await Promise.all(players.map((p) => p.submit()));
  const ask = phone.getByRole('button', { name: 'Night action' });
  await ask.or(phone.getByRole('button', { name: 'Continue' })).click();
  for (const select of await phone.getByRole('dialog').locator('select').all()) {
    const option = select.locator('option:not([disabled]):not([value=""])').last();
    await select.selectOption((await option.getAttribute('value')) as string);
  }
  await phone.getByRole('button', { name: 'Submit' }).click();
  // Done, a phone says nothing more: there are the games until the night ends.
  await expect(phone.getByRole('button', { name: '2048' })).toBeVisible();
  await expect(phone.getByText('The night is ending.')).toHaveCount(0);
  await shot(phone, '5-phone-done');
  await expect(page.getByRole('button', { name: 'Call dawn' })).toBeDisabled();
  await shot(page, '6-night-ending');
  await expect(page.getByRole('button', { name: 'Call dawn' })).toBeEnabled({ timeout: 45_000 });
  await page.getByRole('button', { name: 'Call dawn' }).click();

  // Day 1.
  await expect(page).toHaveURL(/steward\/day/);
  await expect(page.getByText('Nobody died in the night.')).toBeVisible();
  await page.getByRole('button', { name: 'Slayer shot' }).click();
  await page.getByRole('dialog').locator('select').nth(0).selectOption({ label: 'Cy' });
  await page.getByRole('dialog').locator('select').nth(1).selectOption({ label: 'Cy' });
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('dialog', { name: 'Cy shoots Cy?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText('Nothing happens.').first()).toBeVisible();

  await page.getByRole('button', { name: 'Nominate', exact: true }).click();
  await page.getByRole('group', { name: 'Nominator' }).getByRole('button', { name: /Di/ }).click();
  await page.getByRole('group', { name: 'Nominee' }).getByRole('button', { name: /Ed/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Record' }).click();
  await expect(page.getByText(/Di nominates Ed\./).first()).toBeVisible();
  // Ed may be the Virgin, and then the day is over.
  const count = page.getByRole('button', { name: 'Count the votes' });
  if (await count.count()) {
    await count.click();
    for (const name of ['Ann', 'Bo', 'Cy']) {
      await page
        .getByRole('group', { name: 'Voters' })
        .getByRole('button', { name: new RegExp(name) })
        .click();
    }
    await shot(page, '7-votes');
    await page.getByRole('button', { name: 'Record 3 votes' }).click();
    await expect(page.getByText('On the block: Ed, with 3 votes.')).toBeVisible();
    await shot(page, '8-day');
    await page.getByRole('button', { name: 'Execute Ed' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Execute', exact: true }).click();
    await expect(page.getByText('Ed is executed and dies.').first()).toBeVisible();
  }
  await shot(page, '9-dusk');
  await tab(page, 'Table');
  await expect(page.getByRole('button', { name: /dead, 1 vote left/ })).toHaveCount(1);
  await shot(page, '10-table');
  await tab(page, 'Day');
  await page.getByRole('button', { name: 'Start the night' }).click();
  await expect(page).toHaveURL(/steward\/night/);
  await expect(page.getByText('6', { exact: true })).toBeVisible();

  // The log is shut until the game has ended, and then everything opens.
  expect((await page.request.get('/api/g/autoplay/export')).ok()).toBe(false);
  await tab(page, 'Table');
  await page.getByRole('button', { name: 'Abandon' }).click();
  await expect(page).toHaveURL(/steward\/story/, { timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Who was who' })).toBeVisible();
  await expect(phone.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await shot(page, '11-story');
  await tab(page, 'Log');
  await expect(page.getByRole('heading', { name: /Command log \([1-9]/ })).toBeVisible();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page).toHaveURL(/steward\/setup/);
  // The one refusal this test asked for is all that went wrong.
  expect(problems).toEqual([]);
});
