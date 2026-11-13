# Mechanics coverage

Every general mechanic the engine offers, whether or not a current role uses it, and below that what each official
character needs. Each row of this first table has a test in `packages/rules/test/framework/mechanics.test.ts`, written
against throwaway characters. A future official character should mean writing its file, not changing the core.

| Mechanic                            | Primitive                                                             | Current roles                                   | Future characters                              |
| ----------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| Character change on any player      | `ctx.changeCharacter`                                                 | Scarlet Woman, Farmer, Huntsman and Damsel, Imp | Pit-Hag, Barber, Hatter, Engineer              |
| Alignment change                    | `ctx.changeAlignment`                                                 | Goon, Mezepheles                                | Cult Leader                                    |
| Gained, hidden and moving abilities | `ctx.grant`, `ctx.move`, `shownAs`                                    | Philosopher, Cannibal, Lil' Monsta              | Boffin                                         |
| Believed-only ability               | `perceivedOnly`, `believes`                                           | Drunk, Marionette, Cannibal's false eat         | Lunatic                                        |
| Abilities with no player holder     | holder `storyteller` or `game`; Loric fixed at setup                  | Damsel's leftover guess                         | Fabled, Loric                                  |
| Travellers                          | `add_traveller`, `exile_traveller`, public character, resident counts | none                                            | all Travellers                                 |
| Full registration                   | `registersAs` returns character, type, alignment, alive               | Recluse                                         | Spy, Zombuul                                   |
| Setup rules as data                 | `setupRules`, `believes`: counts, Demon count, neighbours, bluffs     | Baron, Balloonist, Godfather, Huntsman, Drunk   | Atheist, Legion, Riot, Kazali, Lunatic, Hermit |
| Evil information                    | evil-info step, `settings.evilInfoPolicy`, `modifyEvilInfo`           | Marionette, Lil' Monsta                         | Magician, Poppy Grower                         |
| Day events with hooks               | `onDayEvent`: nomination, vote, execution (at dusk), exile, statement | Cannibal, Mastermind, Mayor                     | Princess, Vizier, Riot, Goblin                 |
| Game end                            | `checkGameEnd`, `suggestGameEnd`, `suppressGameEnd`, confirmation     | Mayor, Mastermind, Damsel                       | Saint, Evil Twin, Vortox, Heretic              |
| Information transform               | `transformInfo` over every result                                     | none                                            | Vortox                                         |
| Visibility grants                   | `visibility`                                                          | none                                            | Spy, Widow                                     |
| Madness                             | `mad` condition, `record_broke_madness`                               | none                                            | Cerenovus, Harpy, Mutant                       |
| Kill interception and redirect      | `interceptKill` by `interceptPriority`, re-entering once              | Sailor, Innkeeper, Tea Lady, Fool, Mayor        | Monk, Soldier                                  |
| Death and execution triggers        | `onDeath`, `onDayEvent`                                               | Scarlet Woman, Ravenkeeper, Farmer, Grandmother | many                                           |
| Derived conditions                  | `deriveConditions`, three impairment stages                           | No Dashii                                       | none named                                     |
| Questions to other players          | `ctx.ask`; blocks publish unless forced                               | Ravenkeeper, Al-Hadikhia                        | many                                           |
| Malfunction log                     | `ctx.malfunction`, `adjust_malfunctions`                              | Mathematician, Recluse                          | none named                                     |
| Night order                         | numeric positions with gaps                                           | all                                             | all                                            |
| Being chosen by an ability          | `onChosen`                                                            | Goon                                            | none named                                     |

## Primitives added by the per-character pass

Each has a test in `packages/rules/test/framework/wiki-pass.test.ts`, written against throwaway characters.

| Mechanic                                      | Primitive                                          | Current roles | Future characters                                     |
| --------------------------------------------- | -------------------------------------------------- | ------------- | ----------------------------------------------------- |
| One ability stopping another from waking      | `stopsWaking`                                      | none          | Exorcist, Preacher                                    |
| Who woke tonight                              | `ctx.wokeTonight`                                  | none          | Chambermaid                                           |
| End of the night order                        | `nightEnd`                                         | none          | Acrobat                                               |
| An ability acting twice                       | `wakesTwice`                                       | none          | Barista                                               |
| End of the day                                | `onDusk`                                           | none          | Minstrel, Courtier, Vortox, Leviathan, Bone Collector |
| Stopping an alignment change                  | `guardsAlignment`                                  | none          | Spirit of Ivory, Soldier, Revolutionary               |
| Staying sober and healthy                     | `shieldsFrom`                                      | none          | Beggar, Barista, Soldier                              |
| True information whatever else applies        | `guaranteesTruth`                                  | none          | Barista, Zenomancer                                   |
| A granted ability tied to its giver           | `grant` with `whileSourceWorks`                    | none          | Boffin                                                |
| Registering falsely through another's ability | `registersOther`                                   | none          | Lycanthrope, Lil' Monsta's babysitter, Revolutionary  |
| Changing who won                              | `changesWinner`                                    | none          | Heretic                                               |
| Vote weights and failed tallies               | `adjustVote`, with voters recorded                 | none          | Bureaucrat, Thief, God of Ug, Banshee, Legion, Voudon |
| The Storyteller nominating                    | a null `nominator`                                 | none          | Bishop, Riot, Atheist                                 |
| Moving seats                                  | `ctx.swapSeats`                                    | none          | Matron                                                |
| Vote tokens returned                          | `ctx.restoreGhostVote`                             | none          | Ferryman                                              |
| An ability regained for a while               | `keepAbilityWhenDead(player, false)` with `onDusk` | none          | Bone Collector                                        |
| Duplicate characters                          | `setupRules.duplicates`                            | none          | Village Idiot, Legion, Pope                           |
| A player not told their character             | `hidesCharacter`                                   | none          | Tor, Amnesiac                                         |
| Alive, but dead to the table                  | `appearsDead`                                      | none          | Zombuul                                               |

## Design pass

Every character page on the official wiki was read on 2026-11-06: all 183 pages in its seven categories (69
Townsfolk, 24 Outsiders, 27 Minions, 19 Demons, 18 Travellers, 14 Fabled, 12 Loric). Each page was read in full by a
fetching agent, which reported the ability text and what running it takes, from the page's Summary, How to Run,
Examples and Tips sections. The notes below come from those reports. They are condensed, so some jinx detail is left
out; a character's own file must still start from its page and its jinxes.

The pass found two limits of the first plan. It assumed the day is a record the Storyteller keeps, and that holds:
the engine does not police who nominates, who votes or how many executions a day has, so most day rules need only a
`dayNotice` and a Storyteller command. And it assumed the wake list is fixed once a night starts, which the Exorcist
disproves.

How to read the tables: **Built** means the role exists in `packages/rules/src/roles`. **Needs** lists the primitives
a role file would use beyond `picker`, `resolve`, `inform` and `decide`. **Table** means the Storyteller runs it at the
table and the engine only records the result, so a role file would be a reminder.

Known limits:

- `stopsWaking` applies only when the night resolves. A stopped Demon still sees a picker, is waited for like anyone
  else, and has their choice ignored, so a vanishing picker never tells them anything early.
- `adjustVote` needs the voters. A count with no names is kept as entered.
- `hidesCharacter` hides the character card only. A picker's title can still give the role away, so a role file needs
  `shownAs` as well.
- An execution chosen with `record_execution` (or a day action's `ctx.execute`) happens at dusk and goes through
  `interceptKill` like any other kill, so the Fool, Devil's Advocate, Sailor and Tea Lady stop it. The execution is still recorded,
  with `died: false`. Protection the app doesn't build (Pacifist, Scapegoat) is the Storyteller's to apply.

### Townsfolk

| Character      | Built | Acts                                 | Needs                                                                                                       |
| -------------- | ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Acrobat        |       | Night*                               | `nightEnd`, `isImpaired`, `attemptKill`                                                                     |
| Alchemist      |       | First night, then as its Minion      | `grant` of a Minion ability, `shownAs`                                                                      |
| Alsaahir       |       | Day                                  | day action, `suggestGameEnd`                                                                                |
| Amnesiac       |       | Storyteller's choice, day guess      | `hidesCharacter`, `grant`, day action                                                                       |
| Artist         | yes   | Day, once                            | day action                                                                                                  |
| Atheist        |       | Setup                                | `setupRules.counts` (no evil), null `nominator`, day action for the Storyteller's execution, `checkGameEnd` |
| Balloonist     | yes   | Each night                           | `setupRules.counts`, `setupFields`, `registers`                                                             |
| Banshee        |       | On Demon kill                        | `onDeath`, `notify` to all, `adjustVote` for two votes                                                      |
| Bounty Hunter  |       | First night, on known player's death | `setupFields`, `onDeath`, `notify`, turns a Townsfolk evil at setup                                         |
| Cannibal       | yes   | At dusk, after an execution          | `onDayEvent` (execution at dusk), `grant`, conditions                                                       |
| Chambermaid    |       | Each night                           | `wokeTonight`                                                                                               |
| Chef           |       | First night                          | `registers`, `startInfo`                                                                                    |
| Choirboy       |       | When the Demon kills the King        | `setupRules.requires`, `onDeath`, `notify`                                                                  |
| Clockmaker     | yes   | First night                          | `registers`, `startInfo`                                                                                    |
| Courtier       |       | Night, once, then 3 nights           | conditions until `removed`, `onDusk`, `while_source_works`                                                  |
| Cult Leader    |       | Each night, day vote                 | `changeAlignment`, day action, `suggestGameEnd`                                                             |
| Dreamer        |       | Each night                           | `registers`                                                                                                 |
| Empath         | yes   | Each night                           | `registers`, `aliveNeighbours`                                                                              |
| Engineer       |       | Night, once                          | `changeCharacter` with `noActTonight`, `ask`                                                                |
| Exorcist       |       | Night*                               | `stopsWaking`, `notify` to the Demon                                                                        |
| Farmer         | yes   | On night death                       | `changeCharacter`                                                                                           |
| Fisherman      | yes   | Day, once                            | day action                                                                                                  |
| Flowergirl     | yes   | Night*                               | day action (fact), required Review decision if not recorded                                                 |
| Fool           | yes   | First death                          | `interceptKill`                                                                                             |
| Fortune Teller | yes   | Each night                           | `setupFields`, `registers`                                                                                  |
| Gambler        | yes   | Night*                               | role field, `attemptKill`                                                                                   |
| General        |       | Each night                           | Storyteller's judgement through `decide`                                                                    |
| Gossip         | yes   | Day, then night*                     | statements, `decide`                                                                                        |
| Grandmother    | yes   | First night, on death                | `onDeath`                                                                                                   |
| High Priestess |       | Each night                           | `decide` of a player                                                                                        |
| Huntsman       | yes   | Night, once                          | `changeCharacter`                                                                                           |
| Innkeeper      | yes   | Night*                               | `interceptKill`, conditions                                                                                 |
| Investigator   |       | First night                          | `registers`, `startInfo`                                                                                    |
| Juggler        | yes   | First day, that night                | day action, events                                                                                          |
| King           |       | Night when dead outnumber living     | `wakes`, `notify` to the Demon                                                                              |
| Knight         |       | First night                          | `startInfo`                                                                                                 |
| Librarian      |       | First night                          | `registers`, `startInfo`                                                                                    |
| Lycanthrope    |       | Night*                               | `registersOther`, `interceptKill` on the Demon's attack                                                     |
| Magician       |       | Passive                              | `modifyEvilInfo`                                                                                            |
| Mathematician  | yes   | Each night                           | malfunction log                                                                                             |
| Mayor          | yes   | Passive, on night death              | `interceptKill`, `onDayEvent` (execution at dusk)                                                           |
| Minstrel       |       | On a Minion's execution              | `onDayEvent`, conditions until `removed`, `onDusk`                                                          |
| Monk           |       | Night*                               | `interceptKill`                                                                                             |
| Nightwatchman  |       | Night, once                          | `notify` to the chosen player, `oncePerGame`                                                                |
| Noble          |       | First night                          | `registers`, `startInfo`                                                                                    |
| Oracle         | yes   | Night*                               | `registers`                                                                                                 |
| Pacifist       |       | On a good execution                  | Table: `dayNotice`; the Storyteller records `died: false`                                                   |
| Philosopher    | yes   | Night, once                          | `grant`, conditions                                                                                         |
| Pixie          |       | First night, on a death              | `setupFields`, `onDeath`, `grant`, `decide` for madness                                                     |
| Poppy Grower   |       | Passive, on death                    | `modifyEvilInfo`, `onDeath`, `notify`                                                                       |
| Preacher       |       | Each night                           | `stopsWaking`, `deriveConditions`, `notify`                                                                 |
| Princess       |       | First day, that night                | `onDayEvent`, `interceptKill` on the Demon's attack                                                         |
| Professor      | yes   | Night*, once                         | `revive`                                                                                                    |
| Ravenkeeper    | yes   | On night death                       | `wakesOnNightDeath`, `ask`                                                                                  |
| Sage           |       | On Demon kill                        | `wakesOnNightDeath`, `deathCauseTonight`                                                                    |
| Sailor         | yes   | Each night                           | `interceptKill`, conditions                                                                                 |
| Savant         |       | Day                                  | day action                                                                                                  |
| Seamstress     | yes   | Night, once                          | `registers`, `oncePerGame`                                                                                  |
| Shugenja       |       | First night                          | `seatDistance`, `registers`, `startInfo`                                                                    |
| Slayer         | yes   | Day, once                            | day action, `registers`                                                                                     |
| Snake Charmer  |       | Each night                           | `changeCharacter` and `changeAlignment` on both, `addCondition`                                             |
| Soldier        |       | Passive                              | `interceptKill`, `shieldsFrom`, `guardsAlignment`                                                           |
| Steward        |       | First night                          | `startInfo`                                                                                                 |
| Tea Lady       | yes   | Passive                              | `interceptKill`                                                                                             |
| Town Crier     |       | Night*                               | events, `registers`                                                                                         |
| Undertaker     |       | Night*                               | events, `registers`                                                                                         |
| Village Idiot  |       | Each night                           | `setupRules.duplicates`, `setupRules.counts`, `addCondition`                                                |
| Virgin         | yes   | First nomination                     | day action, `registers`, today's execution choice                                                           |
| Washerwoman    |       | First night                          | `registers`, `startInfo`                                                                                    |

### Outsiders

| Character     | Built | Acts                   | Needs                                                                       |
| ------------- | ----- | ---------------------- | --------------------------------------------------------------------------- |
| Barber        |       | Night after death      | `onDeath`, `ask` to the Demon, `changeCharacter` on two players             |
| Butler        | yes   | Each night             | `dayNotice`                                                                 |
| Damsel        | yes   | First night, any guess | `grantToGame`, `suggestGameEnd`                                             |
| Drunk         | yes   | Passive                | `believes`                                                                  |
| Golem         | yes   | Nomination, once       | day action                                                                  |
| Goon          | yes   | First to choose them   | `onChosen`, `changeAlignment`                                               |
| Hatter        |       | Night after death      | `onDeath`, `ask`, `changeCharacter`                                         |
| Heretic       |       | Passive                | `changesWinner`                                                             |
| Hermit        |       | Passive                | `setupRules.counts`, `grant` of each script Outsider                        |
| Klutz         |       | On learning of death   | `onDeath`, day action, `suggestGameEnd`                                     |
| Lunatic       |       | Each night             | `believes`, `perceivedOnly`, `notify` to the Demon                          |
| Moonchild     | yes   | On learning of death   | day action (fact, the day they learn), required Review decision             |
| Mutant        |       | Any time               | Table: mad condition, `record_broke_madness`, execution                     |
| Ogre          |       | First night            | `changeAlignment`, not told alignment                                       |
| Plague Doctor |       | On death               | `onDeath`, `grant` to the Storyteller                                       |
| Politician    |       | Game end               | Table: `changesWinner` cannot judge blame; the Storyteller sets the winners |
| Puzzlemaster  |       | Setup, guess once      | `setupFields`, conditions, day action                                       |
| Qutler        |       | Each night             | As the Butler. The page has the Butler's text word for word                 |
| Recluse       | yes   | Passive                | `registersAs`                                                               |
| Saint         |       | On execution           | `onDayEvent`, `suggestGameEnd`                                              |
| Snitch        |       | First night            | `briefing`, `notify` to each Minion                                         |
| Sweetheart    |       | On death               | `onDeath`, conditions                                                       |
| Tinker        |       | Any time               | Table: the Storyteller's `mark_alive`                                       |
| Zealot        | yes   | Each nomination        | `dayNotice`                                                                 |

### Minions

| Character        | Built | Acts                                       | Needs                                                                |
| ---------------- | ----- | ------------------------------------------ | -------------------------------------------------------------------- |
| Assassin         | yes   | Night*, once                               | `attemptKill` with `unstoppable`                                     |
| Baron            | yes   | Setup                                      | `setupRules.counts`                                                  |
| Boffin           |       | First night                                | `grant` to the Demon with `whileSourceWorks`                         |
| Boomdandy        |       | On execution                               | `onDayEvent`, `decide`, `attemptKill`                                |
| Cerenovus        |       | Each night                                 | mad condition, role field                                            |
| Devil's Advocate | yes   | Each night                                 | `dayNotice`, `interceptKill` (executions)                            |
| Evil Twin        |       | Setup, passive                             | `setupFields`, `suppressGameEnd`, `suggestGameEnd`                   |
| Fearmonger       |       | Each night                                 | `notify` to all, `onDayEvent`, `suggestGameEnd`                      |
| Goblin           |       | Nomination                                 | day action, `onDayEvent`, `suggestGameEnd`                           |
| Godfather        | yes   | First night, after an Outsider's day death | `setupRules.counts`, `wakes`                                         |
| Harpy            |       | Each night                                 | mad condition, `record_broke_madness`                                |
| Marionette       | yes   | Setup                                      | `believes`, `setupRules.neighbours`                                  |
| Mastermind       | yes   | At dusk, after the Demon's execution       | `suppressGameEnd`, `onDayEvent` (execution at dusk)                  |
| Mezepheles       | yes   | First night, on the word                   | `record_statement`, `changeAlignment`                                |
| Organ Grinder    | yes   | Each night, votes                          | conditions, `dayNotice`                                              |
| Pit-Hag          |       | Night*                                     | `changeCharacter`, `decide` for arbitrary deaths                     |
| Poisoner         | yes   | Each night                                 | conditions                                                           |
| Psychopath       | yes   | Day                                        | day action, `dayKill` through protections                            |
| Scarlet Woman    | yes   | On the Demon's death                       | `onDeath`, `onDusk` for a day death, Demon hand-over                 |
| Spy              |       | Each night                                 | `visibility`, `registersAs`                                          |
| Summoner         |       | Setup, third night                         | `setupRules.counts` (no Demon), `suppressGameEnd`, `changeCharacter` |
| Vizier           |       | Day                                        | `notify` to all, `interceptKill`, day action                         |
| Widow            |       | First night                                | `visibility`, conditions, `notify`                                   |
| Witch            | yes   | Each night                                 | conditions, `onDayEvent`                                             |
| Wizard           |       | Once, any time                             | Table: a wish has no fixed effect. Reminder only                     |
| Wraith           |       | Passive                                    | `visibility` of who wakes                                            |
| Xaan             |       | Night X                                    | `setupRules.counts` with `late`, conditions                          |

### Demons

| Character      | Built | Acts                  | Needs                                                              |
| -------------- | ----- | --------------------- | ------------------------------------------------------------------ |
| Al-Hadikhia    | yes   | Night*                | `ask`, `notify` to all, `revive`                                   |
| Fang Gu        |       | Night*                | `setupRules.counts`, `changeCharacter` with `alignment: 'natural'` |
| Imp            | yes   | Night*                | `attemptKill`, Demon hand-over                                     |
| Kazali         |       | First night, night*   | `setupRules.counts`, `changeCharacter` on chosen players           |
| Legion         |       | Night*, votes         | `setupRules.duplicates`, `adjustVote`, `registersAs`               |
| Leviathan      |       | Passive               | `notify` to all, `onDayEvent`, `onDusk`, `suggestGameEnd`          |
| Lil' Monsta    | yes   | Each night            | `move`, `holderIsDemon` per instance, `decide` for the kill        |
| Lleech         |       | First night, night*   | conditions, `interceptKill`, `onDeath`                             |
| Lord of Typhon |       | First night, night*   | `setupRules.neighbours`, `setupRules.counts`                       |
| No Dashii      | yes   | Night*                | `deriveConditions`                                                 |
| Ojo            |       | Night*                | role field, `decide`                                               |
| Po             | yes   | Night*                | state, `attemptKill`                                               |
| Pukka          | yes   | Each night            | conditions                                                         |
| Riot           |       | Day 3                 | `changeCharacter`, `onDayEvent`, null `nominator`                  |
| Shabaloth      | yes   | Night*                | `revive`                                                           |
| Vigormortis    | yes   | Night*                | `keepAbilityWhenDead`, `adoptConditions`                           |
| Vortox         |       | Night*, passive, dusk | `transformInfo`, `onDusk`, `suggestGameEnd`                        |
| Yaggababble    |       | Passive               | `record_statement`, `decide`                                       |
| Zombuul        |       | Night*, first death   | `wakes`, `interceptKill`, `appearsDead`, `registersAs`             |

### Travellers

None is built yet. All use `add_traveller`, public character and `exile_traveller`.

| Character      | Built | Acts              | Needs                                                    |
| -------------- | ----- | ----------------- | -------------------------------------------------------- |
| Apprentice     |       | First night       | `grant`, `shownAs`                                       |
| Barista        |       | Each night        | `shieldsFrom`, `guaranteesTruth`, `wakesTwice`, `notify` |
| Beggar         |       | Passive, day      | `shieldsFrom`, day action, `dayNotice`                   |
| Bishop         |       | Day               | null `nominator`, `dayNotice`                            |
| Bone Collector |       | Night*, once      | `keepAbilityWhenDead`, `refresh`, `onDusk`               |
| Bureaucrat     |       | Each night        | `adjustVote`                                             |
| Butcher        |       | Day               | `dayNotice`                                              |
| Cacklejack     |       | Day, night*       | `changeCharacter`, `decide`                              |
| Deviant        |       | Exile             | Table: the Storyteller judges                            |
| Gangster       |       | Day               | day action                                               |
| Gnome          |       | Setup, nomination | `notify` to all, day action                              |
| Gunslinger     |       | Day               | day action, voters on the vote event                     |
| Harlot         |       | Night*            | `ask`, `attemptKill`                                     |
| Judge          |       | Day, once         | day action                                               |
| Matron         |       | Day               | `swapSeats`                                              |
| Scapegoat      |       | On execution      | Table: the Storyteller records the Scapegoat's execution |
| Thief          |       | Each night        | `adjustVote`                                             |
| Voudon         |       | Passive           | `adjustVote`, `dayNotice`                                |

### Fabled

All are held by the Storyteller, with no player holder.

| Character        | Built | Acts              | Needs                                                       |
| ---------------- | ----- | ----------------- | ----------------------------------------------------------- |
| Angel            |       | Passive           | Table: `onDeath` reminder, the penalty is the Storyteller's |
| Buddhist         |       | Day               | Table: reminder                                             |
| Deus ex Fiasco   |       | Any time          | Table: reminder, and the Storyteller's override tools       |
| Djinn            |       | Setup             | Jinxes shown to all, from the jinx data                     |
| Doomsayer        |       | Day               | day action, `decide`                                        |
| Duchess          |       | Day, night*       | day action, `notify`                                        |
| Ferryman         |       | Final day         | `restoreGhostVote`                                          |
| Fibbin           |       | Once              | Table: the Storyteller's result override                    |
| Fiddler          |       | Ends the game     | Table: `end_game`                                           |
| Hell's Librarian |       | Any time          | Table: reminder                                             |
| Revolutionary    |       | Setup, once       | `setupFields`, `registersOther`, `guardsAlignment`          |
| Sentinel         |       | Setup             | `setupRules.counts`                                         |
| Spirit of Ivory  |       | Passive           | `guardsAlignment`                                           |
| Toymaker         |       | Setup, each night | `modifyEvilInfo`, `dayNotice`                               |

### Loric

All are fixed at setup and held by the Storyteller.

| Character           | Built | Acts           | Needs                                                     |
| ------------------- | ----- | -------------- | --------------------------------------------------------- |
| Big Wig             |       | Nomination     | Table: reminder, `attemptKill` through a day action       |
| Bootlegger          |       | Setup          | Table: reminder                                           |
| Gardener            |       | Setup          | Nothing: the Storyteller already assigns characters       |
| God of Ug           |       | Passive        | `adjustVote`, marker condition for the hat                |
| God of Ug (Ug Mode) |       | Passive        | As the God of Ug. The page restates it in a joke register |
| Hindu               |       | First 4 deaths | `onDeath`, `revive`, `changeCharacter` to a Traveller     |
| Knaves              |       | Passive        | Table: two Storytellers are outside the app               |
| Pope                |       | Setup          | `setupRules.duplicates: 'good'`                           |
| Storm Catcher       |       | Setup, passive | `setupFields`, `interceptKill`, `notify`                  |
| Tor                 |       | Setup, passive | `hidesCharacter`, `onDeath`                               |
| Ventriloquist       |       | Nomination     | Table: mad condition, `died: false`                       |
| Zenomancer          |       | Any time       | day action, `guaranteesTruth`                             |
