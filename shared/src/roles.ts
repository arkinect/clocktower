// Static role data for the 48 roles in design.md section 14.
// Ability texts are verbatim from the design doc. Behaviour lives in server/src/engine/roles.

export type RoleType = 'townsfolk' | 'outsider' | 'minion' | 'demon';
export type Alignment = 'good' | 'evil';

export interface RoleData {
  id: string;
  name: string;
  type: RoleType;
  alignment: Alignment;
  abilityText: string;
  setupModifier?: { outsiders?: number; minions?: number };
  /** Short Admin-only reminder shown in the grimoire for day-only or passive abilities. */
  reminder?: string;
}

const T = 'townsfolk' as const;
const O = 'outsider' as const;
const M = 'minion' as const;
const D = 'demon' as const;

function r(id: string, name: string, type: RoleType, abilityText: string, extra: Partial<RoleData> = {}): RoleData {
  return { id, name, type, alignment: type === 'minion' || type === 'demon' ? 'evil' : 'good', abilityText, ...extra };
}

export const ROLES: RoleData[] = [
  // Townsfolk (24)
  r('clockmaker', 'Clockmaker', T, 'You start knowing how many steps from the Demon to its nearest Minion.'),
  r('sailor', 'Sailor', T, 'Each night, choose an alive player: either you or they are drunk until dusk. You can\'t die.'),
  r('mathematician', 'Mathematician', T, 'Each night, you learn how many players\' abilities worked abnormally (since dawn) due to another character\'s ability.'),
  r('flowergirl', 'Flowergirl', T, 'Each night*, you learn if a Demon voted today.'),
  r('gambler', 'Gambler', T, 'Each night*, choose a player & guess their character: if you guess wrong, you die.'),
  r('philosopher', 'Philosopher', T, 'Once per game, at night, choose a good character: gain that ability. If this character is in play, they are drunk.'),
  r('juggler', 'Juggler', T, 'On your 1st day, publicly guess up to 5 players\' characters. That night, you learn how many you got correct.'),
  r('fool', 'Fool', T, 'The first time you die, you don\'t.', { reminder: 'First death is prevented (night kills automatic). Apply to executions yourself.' }),
  r('empath', 'Empath', T, 'Each night, you learn how many of your 2 alive neighbours are evil.'),
  r('balloonist', 'Balloonist', T, 'Each night, you learn 1 player of each character type, until there are no more types to learn. [+1 Outsider]', { setupModifier: { outsiders: 1 } }),
  r('fortune_teller', 'Fortune Teller', T, 'Each night, choose 2 players: you learn if either is a Demon. There is a good player that registers as a Demon to you.'),
  r('innkeeper', 'Innkeeper', T, 'Each night*, choose 2 players: they can\'t die tonight, but 1 is drunk until dusk.'),
  r('seamstress', 'Seamstress', T, 'Once per game, at night, choose 2 players (not yourself): you learn if they are the same alignment.'),
  r('artist', 'Artist', T, 'Once per game, during the day, privately ask the Storyteller any yes/no question.', { reminder: 'Day ability. Mark used in the Ability tracker.' }),
  r('ravenkeeper', 'Ravenkeeper', T, 'If you die at night, you are woken to choose a player: you learn their character.'),
  r('virgin', 'Virgin', T, 'The 1st time you are nominated, if the nominator is a Townsfolk, they are executed immediately.', { reminder: 'Day ability. No effect if impaired when nominated. Mark used in the Ability tracker.' }),
  r('mayor', 'Mayor', T, 'If only 3 players live & no execution occurs, your team wins. If you die at night, another player might die instead.', { reminder: '3-player win is not enforced.' }),
  r('oracle', 'Oracle', T, 'Each night*, you learn how many dead players are evil.'),
  r('gossip', 'Gossip', T, 'Each day, you may make a public statement. Tonight, if it was true, a player dies.', { reminder: 'Enter True/False/None for the statement in the Day panel.' }),
  r('grandmother', 'Grandmother', T, 'You start knowing a good player & their character. If the Demon kills them, you die too.'),
  r('huntsman', 'Huntsman', T, 'Once per game, at night, choose a living player: the Damsel, if chosen, becomes a not-in-play Townsfolk. [+the Damsel]'),
  r('professor', 'Professor', T, 'Once per game, at night*, choose a dead player: if they are a Townsfolk, they are resurrected.'),
  r('slayer', 'Slayer', T, 'Once per game, during the day, publicly choose a player: if they are the Demon, they die.', { reminder: 'Resolve the shot in the Day panel.' }),
  r('tea_lady', 'Tea Lady', T, 'If both your alive neighbours are good, they can\'t die.', { reminder: 'Protects night kills automatically. Apply to executions yourself.' }),
  // Outsiders (7)
  r('drunk', 'Drunk', O, 'You do not know you are the Drunk. You think you are a Townsfolk character, but you are not.'),
  r('golem', 'Golem', O, 'You may only nominate once per game. When you do, if the nominee is not the Demon, they die.', { reminder: 'Day ability. Mark the death yourself. Mark used in the Ability tracker.' }),
  r('recluse', 'Recluse', O, 'You might register as evil & as a Minion or Demon, even if dead.'),
  r('moonchild', 'Moonchild', O, 'When you learn that you died, publicly choose 1 alive player. Tonight, if it was a good player, they die.', { reminder: 'Record the chosen player in the Day panel after the Moonchild dies.' }),
  r('goon', 'Goon', O, 'Each night, the 1st player to choose you with their ability is drunk until dusk. You become their alignment.'),
  r('butler', 'Butler', O, 'Each night, choose a player (not yourself): tomorrow, you may only vote if they are voting too.', { reminder: 'Voting restriction is not enforced.' }),
  r('damsel', 'Damsel', O, 'All Minions know a Damsel is in play. If a Minion publicly guesses you (once), your team loses.', { reminder: 'Record a Minion\'s guess in the Day panel.' }),
  // Minions (10)
  r('mezepheles', 'Mezepheles', M, 'You start knowing a secret word. The 1st good player to say this word becomes evil that night.', { reminder: 'Record "Word said by X" in the Day panel.' }),
  r('devils_advocate', 'Devil\'s Advocate', M, 'Each night, choose a living player (different to last night): if executed tomorrow, they don\'t die.', { reminder: 'Execution protection is not enforced.' }),
  r('mastermind', 'Mastermind', M, 'If the Demon dies by execution (ending the game), play for 1 more day. If a player is then executed, their team loses.', { reminder: 'Reminder only.' }),
  r('poisoner', 'Poisoner', M, 'Each night, choose a player: they are poisoned tonight and tomorrow day.'),
  r('marionette', 'Marionette', M, 'You think you are a good character but you are not. The Demon knows who you are. [You neighbour the Demon]'),
  r('scarlet_woman', 'Scarlet Woman', M, 'If there are 5 or more players alive & the Demon dies, you become the Demon. (Travellers don\'t count)'),
  r('assassin', 'Assassin', M, 'Once per game, at night*, choose a player: they die, even if for some reason they could not.'),
  r('psychopath', 'Psychopath', M, 'Each day, before nominations, you may publicly choose a player: they die. If executed, you only die if you lose roshambo.', { reminder: 'Day ability. Mark deaths yourself.' }),
  r('godfather', 'Godfather', M, 'You start knowing which Outsiders are in play. If 1 died today, choose a player tonight: they die. [-1 or +1 Outsider]'),
  r('witch', 'Witch', M, 'Each night, choose a player: if they nominate tomorrow, they die. If just 3 players live, you lose this ability.', { reminder: 'If the cursed player nominates, apply the curse in the Day panel.' }),
  // Demons (7)
  r('imp', 'Imp', D, 'Each night*, choose a player: they die. If you kill yourself this way, a Minion becomes the Imp.'),
  r('pukka', 'Pukka', D, 'Each night, choose a player: they are poisoned. The previously poisoned player dies then becomes healthy.'),
  r('shabaloth', 'Shabaloth', D, 'Each night*, choose 2 players: they die. A dead player you chose last night might be regurgitated.'),
  r('po', 'Po', D, 'Each night*, you may choose a player: they die. If your last choice was no-one, choose 3 players tonight.'),
  r('no_dashii', 'No Dashii', D, 'Each night*, choose a player: they die. Your 2 Townsfolk neighbours are poisoned.'),
  r('vigormortis', 'Vigormortis', D, 'Each night*, choose a player: they die. Minions you kill keep their ability & poison 1 Townsfolk neighbour. [-1 Outsider]', { setupModifier: { outsiders: -1 } }),
  r('lil_monsta', 'Lil\' Monsta', D, 'Each night, Minions choose who babysits Lil\' Monsta\'s token & "is the Demon". A player dies each night*. [+1 Minion]', { setupModifier: { minions: 1 } }),
];

export const ROLE_BY_ID: Record<string, RoleData> = Object.fromEntries(ROLES.map((x) => [x.id, x]));

export function role(id: string): RoleData {
  const x = ROLE_BY_ID[id];
  if (!x) throw new Error(`Unknown role ${id}`);
  return x;
}

export const ROLE_TYPES: RoleType[] = ['townsfolk', 'outsider', 'minion', 'demon'];

/** Night order slots. A slot is either a role id or a pseudo-slot. Editable data (section 14.1, 14.2). */
export interface NightSlot { id: string; label: string; roleId?: string; note?: string }

export const FIRST_NIGHT_ORDER: NightSlot[] = [
  { id: 'philosopher', label: 'Philosopher', roleId: 'philosopher' },
  { id: 'demon_info', label: 'Demon Info', note: 'The Demon learns its Minions and 3 bluffs' },
  { id: 'sailor', label: 'Sailor', roleId: 'sailor' },
  { id: 'poisoner', label: 'Poisoner', roleId: 'poisoner' },
  { id: 'godfather', label: 'Godfather', roleId: 'godfather', note: 'Learns the Outsiders in play' },
  { id: 'devils_advocate', label: 'Devil\'s Advocate', roleId: 'devils_advocate' },
  { id: 'witch', label: 'Witch', roleId: 'witch' },
  { id: 'mezepheles', label: 'Mezepheles', roleId: 'mezepheles', note: 'Learns the secret word' },
  { id: 'pukka', label: 'Pukka', roleId: 'pukka' },
  { id: 'huntsman', label: 'Huntsman', roleId: 'huntsman' },
  { id: 'damsel', label: 'Damsel', roleId: 'damsel', note: 'Minions learn a Damsel is in play' },
  { id: 'clockmaker', label: 'Clockmaker', roleId: 'clockmaker' },
  { id: 'empath', label: 'Empath', roleId: 'empath' },
  { id: 'fortune_teller', label: 'Fortune Teller', roleId: 'fortune_teller' },
  { id: 'seamstress', label: 'Seamstress', roleId: 'seamstress' },
  { id: 'balloonist', label: 'Balloonist', roleId: 'balloonist' },
  { id: 'butler', label: 'Butler', roleId: 'butler' },
  { id: 'grandmother', label: 'Grandmother', roleId: 'grandmother', note: 'Learns her grandchild' },
  { id: 'mathematician', label: 'Mathematician', roleId: 'mathematician' },
];

export const OTHER_NIGHT_ORDER: NightSlot[] = [
  { id: 'philosopher', label: 'Philosopher', roleId: 'philosopher' },
  { id: 'sailor', label: 'Sailor', roleId: 'sailor' },
  { id: 'poisoner', label: 'Poisoner', roleId: 'poisoner' },
  { id: 'innkeeper', label: 'Innkeeper', roleId: 'innkeeper' },
  { id: 'gambler', label: 'Gambler', roleId: 'gambler' },
  { id: 'devils_advocate', label: 'Devil\'s Advocate', roleId: 'devils_advocate' },
  { id: 'witch', label: 'Witch', roleId: 'witch', note: 'Only while 4 or more players are alive' },
  { id: 'mezepheles', label: 'Mezepheles', roleId: 'mezepheles', note: 'Only if a good player said the word' },
  { id: 'scarlet_woman', label: 'Scarlet Woman', roleId: 'scarlet_woman', note: 'Only if the Demon died since last night' },
  { id: 'imp', label: 'Imp', roleId: 'imp' },
  { id: 'pukka', label: 'Pukka', roleId: 'pukka' },
  { id: 'shabaloth', label: 'Shabaloth', roleId: 'shabaloth' },
  { id: 'po', label: 'Po', roleId: 'po' },
  { id: 'no_dashii', label: 'No Dashii', roleId: 'no_dashii' },
  { id: 'vigormortis', label: 'Vigormortis', roleId: 'vigormortis' },
  { id: 'lil_monsta', label: 'Lil\' Monsta', roleId: 'lil_monsta', note: 'The token holder passes the token and chooses the victim' },
  { id: 'assassin', label: 'Assassin', roleId: 'assassin' },
  { id: 'godfather', label: 'Godfather', roleId: 'godfather', note: 'Only if an Outsider died today' },
  { id: 'gossip', label: 'Gossip', roleId: 'gossip', note: 'Only if the statement was true' },
  { id: 'professor', label: 'Professor', roleId: 'professor' },
  { id: 'huntsman', label: 'Huntsman', roleId: 'huntsman' },
  { id: 'moonchild', label: 'Moonchild', roleId: 'moonchild', note: 'Only if a target was chosen' },
  { id: 'grandmother', label: 'Grandmother', roleId: 'grandmother', note: 'Only if the Demon killed the grandchild' },
  { id: 'ravenkeeper', label: 'Ravenkeeper', roleId: 'ravenkeeper', note: 'Only if killed tonight' },
  { id: 'empath', label: 'Empath', roleId: 'empath' },
  { id: 'fortune_teller', label: 'Fortune Teller', roleId: 'fortune_teller' },
  { id: 'flowergirl', label: 'Flowergirl', roleId: 'flowergirl' },
  { id: 'oracle', label: 'Oracle', roleId: 'oracle' },
  { id: 'seamstress', label: 'Seamstress', roleId: 'seamstress' },
  { id: 'juggler', label: 'Juggler', roleId: 'juggler', note: 'Night 1 only' },
  { id: 'balloonist', label: 'Balloonist', roleId: 'balloonist' },
  { id: 'butler', label: 'Butler', roleId: 'butler' },
  { id: 'mathematician', label: 'Mathematician', roleId: 'mathematician' },
];

/** Default type-count chart, section 7.4. Index = player count. */
export const TYPE_CHART: Record<number, [number, number, number, number]> = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};
