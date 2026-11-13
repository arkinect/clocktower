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

## canibal fixes

at the moment, when the canibal eats an evil person, they become poisoned and get some random good ability that doesn't work.
however, that they are poisoned is not indicated in the grimoire, or anywhere else. this must be fixed
there's also no need to change which ability they get durring the day. this can be removed from the day ui

## canibal / philosopher interactions with information gained durring the day.

in the case where the flowergirl question (did demon vote) wasn't answered durring the day, and must be answered in the review section, the 'accept all defaults' button goes into the decisions section rather than the what players learn section.

I think i can't remove this from the review screen because if the philosopher becomes the flowergirl at night then this needs to be answered here. the visual bug will have to be fixed, but I will wait to see if this is an actual issue until a game is played with more people.
