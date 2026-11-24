// Script files in a real browser, under the real content security policy. Part of the Storyteller's game rather than a
// test of its own: the server holds four live games at a time, and the suite already uses them all.
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/** On the Setup tab, before the game starts. Leaves the script changed and the settings as they were. */
export async function scriptFiles(page: Page) {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(`${r.method()} ${r.url()}`));
  const heading = (n: number) => page.getByRole('heading', { name: `Script (${n} roles)` });
  const sheet = page.getByRole('dialog', { name: 'Import script' });
  const pick = (text: string) =>
    page
      .getByLabel('Script file')
      .setInputFiles({ name: 's.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  const countdown = page.getByLabel('Night countdown in seconds');
  const setCountdown = async (seconds: string) => {
    await countdown.fill(seconds);
    await countdown.blur();
  };
  const original = await countdown.inputValue();

  // Three roles, one of them homebrew, and a countdown that is not the default.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(heading(0)).toBeVisible();
  for (const [i, role] of ['Imp', 'Fortune Teller', 'Witch King'].entries()) {
    await page.getByRole('checkbox', { name: role, exact: true }).click();
    await expect(heading(i + 1)).toBeVisible();
  }
  await setCountdown('240');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('clocktower-script.json');
  const saved = readFileSync(await download.path(), 'utf8');
  expect(JSON.parse(saved)).toMatchObject([
    { id: '_meta', clocktower: { version: 1, settings: { countdownSeconds: 240 } } },
    'imp',
    'fortuneteller',
    { id: 'witchking', name: 'Witch King', team: 'demon' },
  ]);

  // An official script: the roles change and the settings do not.
  await pick(JSON.stringify([{ id: '_meta', name: 'Official', author: 'Ann' }, 'washerwoman', 'empath', 'po']));
  await expect(sheet.getByText('2 roles will replace the 3 on the script now.')).toBeVisible();
  await expect(sheet.getByText('1 character in the file is not in this app')).toBeVisible();
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(sheet).toBeHidden();
  await expect(heading(2)).toBeVisible();
  await expect(countdown).toHaveValue('240');

  // Our own file brings back both.
  await setCountdown('60');
  await pick(saved);
  await expect(sheet.getByText('Night countdown in seconds: 60 → 240')).toBeVisible();
  await sheet.getByRole('button', { name: 'Apply' }).click();
  await expect(sheet).toBeHidden();
  await expect(heading(3)).toBeVisible();
  await expect(countdown).toHaveValue('240');
  await expect(page.getByRole('checkbox', { name: 'Witch King', exact: true })).toBeChecked();

  // A file that tries things. Its known id is read and nothing else is.
  await pick(
    `[{"id":"_meta","name":"<script>alert(1)</script>","logo":"https://evil.test/l.png","background":"//evil.test/b"},
      {"id":"imp","name":"<img src=x onerror=alert(2)>","image":"https://evil.test/i.png","team":"demon","ability":"x"},
      "<img src=x onerror=alert(3)>", "__proto__", "constructor", "../../evil.test"]`,
  );
  await expect(sheet.getByText('1 role will replace the 3 on the script now.')).toBeVisible();
  await expect(sheet.getByText('4 characters in the file are not in this app')).toBeVisible();
  expect(await page.content()).not.toMatch(/evil\.test|onerror|alert\(/);
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(heading(3)).toBeVisible();

  await pick('{"not":"a script"}');
  await expect(page.getByRole('alert')).toHaveText('That file is not a Clocktower script.');

  // The page asked for role icons at most: the file was never sent, and nothing in it was fetched.
  expect(requests.filter((r) => !/^GET http:\/\/127\.0\.0\.1:\d+\/(icons|assets)\//.test(r))).toEqual([]);
  await setCountdown(original);
}
