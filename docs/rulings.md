# Rulings

Judgement calls where the character text does not settle what the app should do.

## Vigormortis and Scarlet Woman

If the Vigormortis dies and the Scarlet Woman takes over, the new Vigormortis keeps the last one's effects: the killed
Minion keeps their ability and their neighbour stays poisoned. The new character adopts the conditions the last
instance caused (`roles/vigormortis.ts`). Test: `roles/vigormortis.test.ts`, "ruling".

## Lil' Monsta's extra Minion

The text says [+1 Minion]. The type counts stay as they are, because the player in the Demon slot becomes a Minion at
the first dawn and holds the token. That already is the extra Minion.

## Decisions are keyed by what they decide

A Storyteller decision is keyed by the attacker, the cause and the attempt, not by its order in the night. An attack the
Storyteller has already ruled on keeps that ruling when other answers change.

## Nominations

The console doesn't record nominations. The Virgin, the Golem and a Witch's curse are day actions the Storyteller uses
when the nomination happens, each with a preview. The Psychopath's daily kill is one too, so protections such as the
Tea Lady apply.

## Executions happen at dusk

During the day the Storyteller only chooses the execution, and can change the choice or call it off. The execution
happens at dusk (Start Night), to whoever was chosen last. It happens before the day's conditions end, so the Devil's
Advocate's mark and the day's poison still count. Then the dusk hooks run (the Scarlet Woman), and then what the
execution triggers for other characters (Cannibal, Mastermind, Mayor). A chosen player who is already dead by then
dies of nothing new. The Virgin's nominator is chosen the same way and dies at dusk. Test: `scenarios/dusk.test.ts`.

## When the Moonchild learns they died

A Moonchild learns of an execution the next morning, as of a night death: the execution happens at dusk, and whether
it killed them (a Tea Lady may save them) shows at dawn. The Storyteller records their choice on that day's Day tab,
and a good target dies that night. Any other day death (a Slayer's shot, a Witch's curse) is seen as it happens, so
they choose that same day. Not recorded by the night after they learn, the night's Review asks for it before dawn.
Test: `roles/moonchild.test.ts`.

## The Cannibal eating an evil player

The Cannibal is poisoned, and believes they ate a good player. They get a random Townsfolk or Outsider from the script,
other than the Cannibal, as a believed-only ability: they wake as it and get false information. The Storyteller can
change it on the Day tab from the next day. Test: `scenarios/cannibal.test.ts`.

## Protection from execution

An execution goes through the same protection as any other kill. A player the Devil's Advocate chose last night, a
Fool's first death, a sober Sailor and a Tea Lady's good neighbour are executed and do not die. The execution still
counts for the day (no second execution, and the dusk triggers see a survivor). A choice changed away from a protected
player before dusk spends nothing. A Devil's Advocate who is dead or drunk or poisoned by then
protects nobody, and the Devil's Advocate goes before the Fool, so a marked Fool keeps their save. Tests:
`roles/devils-advocate.test.ts`, `roles/fool.test.ts`.

## The Scarlet Woman after a day death

When the Demon dies during the day, the Scarlet Woman becomes the Demon at dusk, with nothing to confirm, if the Demon
is still dead and she is alive and not drunk or poisoned then. She makes the Demon's choice that same night. A Demon
death at night is still a Review decision. Test: `roles/scarlet-woman.test.ts`.

## Travellers and the Scarlet Woman

The character text says Travellers do not count. `aliveBefore` counts living non-Travellers, and so does the
Mastermind's event. Test: `roles/scarlet-woman.test.ts`, "does not count Travellers towards the 5".

## Travellers and the official evil information

With the official policy, Minions and the Demon learn each other at 7 or more players. The rule is about the players the
script is built for, so the count is of non-Travellers. Six players and a Traveller get the small-game treatment. Test:
`framework/mechanics.test.ts`, "Travellers do not count towards the official 7".

## Who can be chosen at night

"Choose a player" means any seated player, alive or dead, including the chooser: the Imp's How to Run states this,
and the Imp, Ravenkeeper, Butler and Al-Hadikhia pages all give dead targets as examples. A narrower list needs the
character's own words: "alive" or "living" (Sailor, Devil's Advocate, Huntsman) limits it to living players, "dead"
(Professor) to dead ones, and "(not yourself)" (Butler, Seamstress) excludes the chooser. A Traveller who has left
is never an option. Every night dropdown was audited against the wiki for v0.5.1.

Two deliberate departures, both kept after review: the Professor cannot raise a player who died earlier the same
night, and the Philosopher may only choose a good character on the current script, as the Cannibal's fake ability
does.

## Travellers and "players alive"

A "players alive" threshold never counts Travellers (`aliveResidents`), as the Scarlet Woman's text spells out. This
covers the Mayor, the Scarlet Woman and the Witch, and the Zealot's reminder reads the same way (it isn't enforced).
Tests: `roles/witch.test.ts` and `roles/mayor.test.ts`, "does not count Travellers".

## When follow-up questions extend the deadline

`followUpExtensionSeconds` is added the first time a night has questions, whatever brought them, and only once, even if
collecting is reopened and closed again. Tests: `framework/mechanics.test.ts`, "follow-up questions".

## Messages

A player's inbox keeps the full history of the game. It is not cleared at dusk.
