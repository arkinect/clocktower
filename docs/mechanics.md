# Mechanics coverage

Every general mechanic the engine offers, whether or not a current role uses it. Each row has a test in
`packages/rules/test/framework/mechanics.test.ts`, written against throwaway characters. A future official character
should mean writing its file, not changing the core.

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
| Day events with hooks               | `onDayEvent`: nomination, vote, execution, exile, statement           | Virgin, Witch, Golem, Cannibal, Mastermind      | Princess, Vizier, Riot, Goblin                 |
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

## Design pass

The wiki's Character Types, Travellers, Fabled and Loric pages were read on 2026-11-06. The per-character pages were
not, so this pass covers kinds of mechanic rather than every character. It confirmed the rows for Travellers (join and
leave at any time, Storyteller-set alignment, exile, not counted for the last-two-alive win, evil Travellers learn only
the Demon) and for Fabled and Loric (not players, immune to death, drunkenness and poisoning; Fabled may come and go,
Loric are fixed at the start). It added no primitive beyond the plan's table. `onChosen` came from porting the Goon.
