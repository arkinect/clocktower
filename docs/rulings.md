# Rulings

Where the plan, the old app and the official rules disagree. The old app wins unless it is clearly a bug.

## Vigormortis and Scarlet Woman

If the Vigormortis dies and the Scarlet Woman takes over, the new Vigormortis keeps the last one's effects: the killed
Minion keeps their ability and their neighbour stays poisoned. In the old app those effects ended with the first
Vigormortis, which the setup warning only papered over. The new character adopts the conditions the old instance
caused (`roles/vigormortis.ts`). Test: `roles/vigormortis.test.ts`, "ruling".

## Lil' Monsta's extra Minion

The text says [+1 Minion]. The old app keeps the type counts as they are, because the player in the Demon slot becomes
a Minion at the first dawn and holds the token. That already is the extra Minion, so the counts do not change.

## Decisions are keyed by what they decide

The old app numbered its Mayor decisions by kill order, so a choice could silently land on a different attack if an
earlier answer changed the night. The new key is the attacker, the cause and the attempt. An attack the Storyteller has
already ruled on keeps that ruling when other answers change.

## Nominations

The old app left the Virgin, the Golem and a Witch's curse for the Storyteller to apply by hand. Recording a nomination
now raises a prompt for each, and the Storyteller still decides. Nothing happens without their answer.

## Travellers and the Scarlet Woman

The old app counted everyone alive, Travellers included, when the Demon died. The character text says Travellers do
not count, so the old app was wrong. `aliveBefore` now counts living non-Travellers, and so does the Mastermind's event.
Test: `roles/scarlet-woman.test.ts`, "does not count Travellers towards the 5".

## Travellers and the official evil information

With the official policy, Minions and the Demon learn each other at 7 or more players. The old app counted Travellers.
The rule is about the players the script is built for, so the count is now of non-Travellers. Six players and a
Traveller get the small-game treatment. Test: `framework/mechanics.test.ts`, "Travellers do not count towards the
official 7".

## When follow-up questions extend the deadline

The old app added `followUpExtensionSeconds` every time the Storyteller closed collecting with questions open, and
never when a later decision brought the questions. Here the extension comes the first time a night has questions,
whatever brought them, and only once, even if collecting is reopened and closed again. Tests:
`framework/mechanics.test.ts`, "follow-up questions".
