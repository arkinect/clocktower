# Backlog

Things we know about and chose not to do yet. Newest first.

## An execution that is survived by a Storyteller ruling

Since 0.5.1 the execution is a choice on the Day tab that resolves at dusk, and protections (the Fool, the Devil's
Advocate, a sober Sailor, a Tea Lady's neighbour) apply by themselves. A survival that is **not** automatic has no
control: the engine accepts `record_execution { died: false }`, which counts the execution, kills nobody and leaves
the Cannibal unfed, but nothing in the console ever sends it.

It matters for the Psychopath, who survives an execution by winning roshambo at the table. For now the Storyteller
leaves them out of the execution instead, which is why the Psychopath has no day reminder.

The fix is a "they survive it (my ruling)" control beside the execution dropdown that sends `died: false`, plus a
rules test that such an execution counts, kills nobody and leaves the Cannibal unfed.

## there's an inconsistent placement of abilities in the day menu between "facts for tonight" and "day abilities"

everything goes into day abilities (or some kind of day checklist)

## lil monsta

the simplificaiton has the current token holder decide who holds it next
this functionally prevents the minions from handing lil monsta off to someone good. there's no mechanism to reclaim, and no mechanism to kill

a better implementation would have the original demon BE lil monsta, with some minion power. they choose who holds the token at any given moment. effectively prime minion.
they can choose who to kill (or this can be made random / by admin)
also it seems like the current implementation blocks the babysitter from becoming evil which is wrong
also double check what the ui looks like in context of magician jinx
