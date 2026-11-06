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
