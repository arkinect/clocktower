// Script files: what is written, what is accepted, and that nothing else gets through.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RoleCard, SetScript, SetSettings, type RoleId, type StorytellerView } from '@ct/protocol';

const run = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const store = vi.hoisted(() => ({ catalog: [] as unknown[] }));
vi.mock('../src/app/store', () => ({
  useCommand: () => ({ run, pending: false }),
  useGame: () => ({ catalog: store.catalog, jinxes: [] }),
  useNames: () => ({ players: {}, roles: { imp: 'Imp' } }),
}));

import { ScriptTransfer } from '../src/storyteller/ScriptTransfer';
import {
  MAX_BYTES,
  MAX_ENTRIES,
  SECONDS,
  buildScript,
  parseScript,
  settingChanges,
  type GameSettings,
} from '../src/storyteller/scriptFile';

const role = (roleId: string, type: string, over: Record<string, unknown> = {}) =>
  RoleCard.parse({
    roleId,
    name: roleId,
    type,
    abilityText: `${roleId} ability`,
    reminder: null,
    firstNight: null,
    otherNight: null,
    homebrew: false,
    ...over,
  });

const catalog = [
  role('imp', 'demon', { name: 'Imp' }),
  role('fortune_teller', 'townsfolk'),
  role('lil_monsta', 'demon'),
  role('witch_king', 'demon', { name: 'Witch King', homebrew: true }),
  role('beggar', 'traveller'),
  role('djinn', 'fabled'),
];

const settings: GameSettings = {
  countdownSeconds: 300,
  followUpExtensionSeconds: 120,
  announceDeaths: false,
  notifyOnRoleChange: true,
  evilInfoPolicy: 'house',
};

const parse = (value: unknown) => parseScript(JSON.stringify(value), catalog);
const meta = (clocktower: unknown) => ({ id: '_meta', name: 'x', clocktower });
const withSettings = (s: unknown, version: unknown = 1) => [meta({ version, settings: s }), 'imp'];

describe('writing a script file', () => {
  const script = ['imp', 'fortune_teller', 'witch_king'] as RoleId[];

  it('is an official script with the settings as one extra field', () => {
    expect(buildScript(script, settings, catalog)).toEqual([
      { id: '_meta', name: 'Clocktower script', clocktower: { version: 1, settings } },
      'imp',
      'fortuneteller',
      { id: 'witchking', name: 'Witch King', team: 'demon', ability: 'witch_king ability' },
    ]);
  });

  it('reads back as what was written', () => {
    expect(parse(buildScript(script, settings, catalog))).toEqual({ ok: true, roles: script, ignored: 0, settings });
  });
});

describe('reading a script file', () => {
  it('reads a file from the official tool, leaving the settings alone', () => {
    expect(parse([{ id: '_meta', name: 'Trouble', author: 'Ann', logo: 'https://x.test/a.png' }, 'imp'])).toEqual({
      ok: true,
      roles: ['imp'],
      ignored: 0,
      settings: null,
    });
    expect(parse(['imp'])).toMatchObject({ ok: true, roles: ['imp'], settings: null });
  });

  it('reads an id in any spelling, and as an object', () => {
    for (const id of ['fortuneteller', 'fortune_teller', 'Fortune Teller', 'fortune-teller']) {
      expect(parse([id])).toMatchObject({ ok: true, roles: ['fortune_teller'] });
      expect(parse([{ id }])).toMatchObject({ ok: true, roles: ['fortune_teller'] });
    }
  });

  it('leaves out characters this app does not have, and repeats, and counts the first', () => {
    expect(parse(['imp', 'imp', 'legion', 'legion', { id: 'mybrew', name: 'x', ability: 'y' }])).toEqual({
      ok: true,
      roles: ['imp'],
      ignored: 2,
      settings: null,
    });
  });

  it('leaves out Fabled, which are not on the script', () => {
    expect(parse(['imp', 'djinn'])).toMatchObject({ roles: ['imp'], ignored: 1 });
  });

  it('takes nothing but the id from a homebrew character', () => {
    const evil = { id: 'imp', name: '<img src=x onerror=alert(1)>', image: 'javascript:alert(1)', ability: '<script>' };
    expect(parse([evil])).toEqual({ ok: true, roles: ['imp'], ignored: 0, settings: null });
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', '   ', '<img src=x onerror=alert(1)>'])(
    'finds no character called %j',
    (id) => {
      expect(parse([id, 'imp'])).toMatchObject({ roles: ['imp'], ignored: 1 });
      expect(parse([id])).toMatchObject({ ok: false });
    },
  );

  it('is not fooled by a __proto__ key', () => {
    const text =
      '[{"id":"_meta","__proto__":{"clocktower":{"version":1,"settings":{"countdownSeconds":60}}}},' +
      '{"id":"imp","__proto__":{"polluted":1}}]';
    expect(parseScript(text, catalog)).toEqual({ ok: true, roles: ['imp'], ignored: 0, settings: null });
    const inner = '[{"id":"_meta","clocktower":{"version":1,"settings":{"__proto__":{"countdownSeconds":60}}}},"imp"]';
    expect(parseScript(inner, catalog)).toMatchObject({ ok: true, settings: {} });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it.each([
    ['not JSON', 'imp, empath'],
    ['empty', ''],
    ['an object', '{"roles":["imp"]}'],
    ['a string', '"imp"'],
    ['null', 'null'],
    ['an entry that is null', '["imp",null]'],
    ['an entry that is a number', '["imp",1]'],
    ['an entry that is a list', '["imp",["imp"]]'],
    ['an id that is an object', '["imp",{"id":{"toString":"imp"}}]'],
    ['an entry with no id', '["imp",{"name":"Imp"}]'],
    ['two _meta entries', '[{"id":"_meta"},{"id":"_meta"},"imp"]'],
    ['no characters', '[]'],
    ['only characters this app does not have', '["legion"]'],
    ['deep nesting', '['.repeat(100_000)],
    ['too many entries', JSON.stringify(Array(MAX_ENTRIES + 1).fill('imp'))],
    ['too much text', JSON.stringify(['imp', 'x'.repeat(MAX_BYTES)])],
  ])('refuses %s', (_name, text) => {
    expect(parseScript(text, catalog).ok).toBe(false);
  });

  it('says when a file comes from a newer version', () => {
    expect(parse(withSettings(settings, 2))).toEqual({
      ok: false,
      error: 'That file was made by a newer version of this app.',
    });
  });

  it.each([[0], [-1], [1.5], ['1'], [null], [undefined]])('refuses version %j', (version) => {
    expect(parse([meta({ version, settings }), 'imp']).ok).toBe(false);
  });

  it.each([
    { countdownSeconds: SECONDS.min - 1 },
    { countdownSeconds: SECONDS.max + 1 },
    { countdownSeconds: 60.5 },
    { countdownSeconds: '60' },
    { countdownSeconds: 1e99 },
    { followUpExtensionSeconds: null },
    { announceDeaths: 'true' },
    { notifyOnRoleChange: 1 },
    { evilInfoPolicy: 'constructor' },
    { evilInfoPolicy: ['house'] },
    [],
    'x',
    null,
  ])('refuses settings %j', (s) => {
    expect(parse(withSettings(s)).ok).toBe(false);
  });

  it('takes only the settings it knows, and allows some to be missing', () => {
    expect(parse(withSettings({ countdownSeconds: 60, type: 'remove_player', future: 1 }))).toMatchObject({
      settings: { countdownSeconds: 60 },
    });
    const read = parse(withSettings({ countdownSeconds: 60, type: 'remove_player' }));
    expect(read.ok && Object.keys(read.settings ?? {})).toEqual(['countdownSeconds']);
  });

  it('only ever reads what the server would accept', () => {
    for (const n of [SECONDS.min, SECONDS.max]) {
      const read = parse(withSettings({ ...settings, countdownSeconds: n, followUpExtensionSeconds: n }));
      if (!read.ok) throw new Error(read.error);
      expect(SetSettings.safeParse({ type: 'set_settings', ...read.settings }).success).toBe(true);
      expect(SetScript.safeParse({ type: 'set_script', roleIds: read.roles }).success).toBe(true);
    }
    // The limits are the server's own, not merely inside them.
    for (const n of [SECONDS.min - 1, SECONDS.max + 1]) {
      expect(SetSettings.safeParse({ type: 'set_settings', countdownSeconds: n }).success).toBe(false);
    }
  });
});

describe('setting changes', () => {
  it('lists only what differs', () => {
    expect(settingChanges(settings, { ...settings, countdownSeconds: 240, announceDeaths: true })).toEqual({
      changes: { countdownSeconds: 240, announceDeaths: true },
      lines: ['Night countdown in seconds: 300 → 240', 'Announce deaths on phones: off → on'],
    });
    expect(settingChanges(settings, { evilInfoPolicy: 'official' }).lines).toEqual([
      'Evil information: House → Official',
    ]);
    expect(settingChanges(settings, settings).lines).toEqual([]);
    expect(settingChanges(settings, null)).toEqual({ changes: {}, lines: [] });
  });
});

describe('the Import button', () => {
  beforeEach(() => {
    store.catalog = catalog;
  });
  afterEach(() => {
    cleanup();
    run.mockReset();
    run.mockImplementation(async () => ({ ok: true }));
  });

  const view = (kind = 'setup', players: unknown[] = []) =>
    ({ phase: { kind }, script: ['lil_monsta', 'imp'], settings, players }) as unknown as StorytellerView;

  /** jsdom's File has no text(). */
  const pick = (text: string, size = text.length) => {
    const file = { name: 's.json', size, text: vi.fn(async () => text) };
    fireEvent.change(screen.getByLabelText('Script file'), { target: { files: [file] } });
    return file;
  };
  const sheet = () => screen.findByRole('dialog', { name: 'Import script' });

  it('sends nothing until Apply, then the script and only the settings that change', async () => {
    render(<ScriptTransfer view={view()} />);
    pick(JSON.stringify([...withSettings({ ...settings, countdownSeconds: 240 }), 'legion']));
    const box = within(await sheet());
    box.getByText('1 role will replace the 2 on the script now.');
    box.getByText('1 character in the file is not in this app and will be left out.');
    box.getByText('Night countdown in seconds: 300 → 240');
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(box.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(run.mock.calls).toEqual([
      [{ type: 'set_script', roleIds: ['imp'] }],
      [{ type: 'set_settings', countdownSeconds: 240 }],
    ]);
  });

  it('sends the script alone when the file has no settings', async () => {
    render(<ScriptTransfer view={view()} />);
    pick('["imp"]');
    const box = within(await sheet());
    box.getByText('The settings stay as they are.');
    fireEvent.click(box.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(run.mock.calls).toEqual([[{ type: 'set_script', roleIds: ['imp'] }]]);
  });

  it('stays open, and sends no settings, when the script is refused', async () => {
    run.mockImplementation(async () => ({ ok: false }));
    render(<ScriptTransfer view={view()} />);
    pick(JSON.stringify(withSettings({ countdownSeconds: 240 })));
    const box = within(await sheet());
    fireEvent.click(box.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    await sheet();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when cancelled', async () => {
    render(<ScriptTransfer view={view()} />);
    pick('["imp"]');
    fireEvent.click(within(await sheet()).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it('warns about a player whose character is not on the new script', async () => {
    render(<ScriptTransfer view={view('setup', [{ id: 'a', name: 'Ann', character: 'imp' }])} />);
    pick('["beggar"]');
    within(await sheet()).getByText(/Ann is the Imp, which is not on this script/);
  });

  it('shows nothing from a file it refuses', async () => {
    render(<ScriptTransfer view={view()} />);
    pick('["<b>boo</b>"]');
    expect((await screen.findByRole('alert')).textContent).toBe('That file has no characters this app knows.');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.innerHTML).not.toContain('boo');
  });

  it('refuses a big file without reading it', async () => {
    render(<ScriptTransfer view={view()} />);
    const file = pick('["imp"]', MAX_BYTES + 1);
    expect((await screen.findByRole('alert')).textContent).toBe('That file is too big to be a script.');
    expect(file.text).not.toHaveBeenCalled();
  });

  it('is there only before the game starts', () => {
    const { rerender } = render(<ScriptTransfer view={view('lobby')} />);
    screen.getByRole('button', { name: 'Import' });
    for (const kind of ['night', 'day', 'ended']) {
      rerender(<ScriptTransfer view={view(kind)} />);
      expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
      screen.getByRole('button', { name: 'Export' });
    }
  });
});
