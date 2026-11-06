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

Recording a nomination raises a prompt for the Virgin, the Golem and a Witch's curse, and the Storyteller decides.
Nothing happens without their answer.

## Travellers and the Scarlet Woman

The character text says Travellers do not count. `aliveBefore` counts living non-Travellers, and so does the
Mastermind's event. Test: `roles/scarlet-woman.test.ts`, "does not count Travellers towards the 5".

## Travellers and the official evil information

With the official policy, Minions and the Demon learn each other at 7 or more players. The rule is about the players the
script is built for, so the count is of non-Travellers. Six players and a Traveller get the small-game treatment. Test:
`framework/mechanics.test.ts`, "Travellers do not count towards the official 7".

## When follow-up questions extend the deadline

`followUpExtensionSeconds` is added the first time a night has questions, whatever brought them, and only once, even if
collecting is reopened and closed again. Tests: `framework/mechanics.test.ts`, "follow-up questions".

## Messages

A player's inbox keeps the full history of the game. It is not cleared at dusk.
