// Reading and writing script files. The format is the official script tool's: a list of character ids, with an optional
// `_meta` entry. Ours adds one field to `_meta`, which other tools ignore, holding the Setup tab's settings.
//
// A file can come from anyone, so nothing in it is trusted or shown. What leaves parseScript is built here: role ids
// taken from the catalog, and settings checked one by one. Names, ability texts and image links are never read.
import type { CharacterType, RoleCard, RoleId, StorytellerView } from '@ct/protocol';

export type GameSettings = StorytellerView['settings'];

export const SCRIPT_TYPES: readonly CharacterType[] = ['townsfolk', 'outsider', 'minion', 'demon', 'traveller'];

/** The countdown lengths the server accepts, in seconds. */
export const SECONDS = { min: 10, max: 3600 };

export const EVIL_INFO: { id: GameSettings['evilInfoPolicy']; text: string }[] = [
  { id: 'house', text: 'House' },
  { id: 'official', text: 'Official' },
  { id: 'teensyville', text: 'Teensyville' },
];

export const SETTING_LABELS: Record<keyof GameSettings, string> = {
  evilInfoPolicy: 'Evil information',
  countdownSeconds: 'Night countdown in seconds',
  followUpExtensionSeconds: 'Extra seconds for a follow-up question',
  announceDeaths: 'Announce deaths on phones',
  notifyOnRoleChange: 'Tell a player when their character changes',
};

const SETTING_KEYS = Object.keys(SETTING_LABELS) as (keyof GameSettings)[];

const isSeconds = (v: unknown) => Number.isInteger(v) && (v as number) >= SECONDS.min && (v as number) <= SECONDS.max;
const isBoolean = (v: unknown) => typeof v === 'boolean';

/** The same limits as the set_settings command. */
const VALID: Record<keyof GameSettings, (v: unknown) => boolean> = {
  evilInfoPolicy: (v) => EVIL_INFO.some((o) => o.id === v),
  countdownSeconds: isSeconds,
  followUpExtensionSeconds: isSeconds,
  announceDeaths: isBoolean,
  notifyOnRoleChange: isBoolean,
};

export const MAX_BYTES = 256 * 1024;
/** The official format's own limit, `_meta` included. */
export const MAX_ENTRIES = 201;

const VERSION = 1;
const META = '_meta';
/** Our field in `_meta`. */
const EXTENSION = 'clocktower';

/** Official ids have no separators ("fortuneteller"); ours do ("fortune_teller"). Both spellings read the same. */
const officialId = (id: string) => id.toLowerCase().replace(/[^a-z0-9]/g, '');

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The file's contents. A homebrew character is written out in full, as other tools refuse an id they do not know. */
export function buildScript(script: readonly RoleId[], settings: GameSettings, catalog: readonly RoleCard[]) {
  const cards = new Map(catalog.map((c) => [c.roleId, c]));
  return [
    { id: META, name: 'Clocktower script', [EXTENSION]: { version: VERSION, settings } },
    ...script.map((role) => {
      const card = cards.get(role);
      const id = officialId(role);
      return card?.homebrew ? { id, name: card.name, team: card.type, ability: card.abilityText } : id;
    }),
  ];
}

export interface ScriptFile {
  roles: RoleId[];
  /** Characters in the file that this app does not have. */
  ignored: number;
  /** Null when the file has none, as a file from another tool does. */
  settings: Partial<GameSettings> | null;
}

export type Parsed = ({ ok: true } & ScriptFile) | { ok: false; error: string };

const refuse = (error: string): Parsed => ({ ok: false, error });

export const TOO_BIG = 'That file is too big to be a script.';
const NOT_A_SCRIPT = 'That file is not a Clocktower script.';

function readSettings(extension: unknown): { settings: Partial<GameSettings> | null } | { error: string } {
  if (extension === undefined) return { settings: null };
  if (!isObject(extension)) return { error: NOT_A_SCRIPT };
  const { version, settings } = extension;
  if (!Number.isInteger(version) || (version as number) < 1) return { error: NOT_A_SCRIPT };
  if ((version as number) > VERSION) return { error: 'That file was made by a newer version of this app.' };
  if (settings === undefined) return { settings: null };
  if (!isObject(settings)) return { error: NOT_A_SCRIPT };
  const out: Json = {};
  for (const key of SETTING_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    if (!VALID[key](value)) return { error: `That file has a setting that is not allowed: ${SETTING_LABELS[key]}.` };
    out[key] = value;
  }
  return { settings: out as Partial<GameSettings> };
}

export function parseScript(text: string, catalog: readonly RoleCard[]): Parsed {
  if (text.length > MAX_BYTES) return refuse(TOO_BIG);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return refuse(NOT_A_SCRIPT);
  }
  if (!Array.isArray(json)) return refuse(NOT_A_SCRIPT);
  if (json.length > MAX_ENTRIES) return refuse(TOO_BIG);

  // A Map, not an object: an id such as "constructor" must find nothing.
  const known = new Map<string, RoleId>();
  for (const c of catalog) if (SCRIPT_TYPES.includes(c.type)) known.set(officialId(c.roleId), c.roleId);

  const roles = new Set<RoleId>();
  const ignored = new Set<string>();
  let meta: Json | null = null;
  for (const entry of json as unknown[]) {
    const id = isObject(entry) ? entry['id'] : entry;
    if (typeof id !== 'string') return refuse(NOT_A_SCRIPT);
    if (isObject(entry) && id === META) {
      if (meta) return refuse(NOT_A_SCRIPT);
      meta = entry;
      continue;
    }
    const role = known.get(officialId(id));
    if (role) roles.add(role);
    else ignored.add(id);
  }
  const read = readSettings(meta?.[EXTENSION]);
  if ('error' in read) return refuse(read.error);
  if (!roles.size) return refuse('That file has no characters this app knows.');
  return { ok: true, roles: [...roles], ignored: ignored.size, settings: read.settings };
}

const shown = (key: keyof GameSettings, value: GameSettings[keyof GameSettings]) => {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (key === 'evilInfoPolicy') return EVIL_INFO.find((o) => o.id === value)?.text ?? '';
  return String(value);
};

/** The settings a file would change, and a line for each. */
export function settingChanges(current: GameSettings, next: Partial<GameSettings> | null) {
  const keys = SETTING_KEYS.filter((k) => next?.[k] !== undefined && next[k] !== current[k]);
  return {
    changes: Object.fromEntries(keys.map((k) => [k, next?.[k]])) as Partial<GameSettings>,
    lines: keys.map(
      (k) =>
        `${SETTING_LABELS[k]}: ${shown(k, current[k])} → ${shown(k, next?.[k] as GameSettings[keyof GameSettings])}`,
    ),
  };
}
