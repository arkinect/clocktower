// Views built by hand, as the server would send them: the web never imports the rules.
import { AbilityView, ConditionView, GrimoirePlayer, RoleCard, type StorytellerView } from '@ct/protocol';

export const ability = (over: Record<string, unknown>) =>
  AbilityView.parse({
    id: 'a90',
    roleId: 'slayer',
    name: 'Slayer',
    shownAs: null,
    origin: 'character',
    perceivedOnly: false,
    used: false,
    active: true,
    oncePerGame: true,
    usageAuto: false,
    reminder: null,
    dayReminder: false,
    from: 'Night 0',
    survivesDeath: false,
    summary: [],
    ...over,
  });

export const condition = (over: Record<string, unknown>) =>
  ConditionView.parse({
    id: 'c1',
    type: 'poisoned',
    name: null,
    label: 'poisoned',
    until: 'dusk',
    sourceLabel: 'Poisoner',
    ...over,
  });

export const player = (over: Record<string, unknown>) =>
  GrimoirePlayer.parse({
    id: 'aaaaaaaaaaaaaaaa',
    name: 'Ann',
    seat: 0,
    alive: true,
    deathCause: null,
    character: null,
    alignment: 'good',
    self: { character: null, alignment: 'good' },
    abilities: [],
    conditions: [],
    impaired: false,
    causes: [],
    ghostVoteUsed: false,
    hasSeenRole: false,
    rolePreference: 'none',
    connected: true,
    departed: false,
    isDemon: false,
    ...over,
  });

export const console_ = (over: Partial<StorytellerView['phase']>, players: GrimoirePlayer[] = []) =>
  ({
    players,
    phase: { kind: 'day', n: 1, stage: null, deadline: null, winner: null, endedReason: null, ...over },
  }) as Pick<StorytellerView, 'players' | 'phase'> as StorytellerView;

export const card = RoleCard.parse({
  roleId: 'empath',
  name: 'Empath',
  type: 'townsfolk',
  abilityText: 'Each night, you learn how many of your 2 alive neighbors are evil.',
  reminder: null,
  firstNight: 1,
  otherNight: 1,
  homebrew: false,
});
