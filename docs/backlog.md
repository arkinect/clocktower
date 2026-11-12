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

## disparate language in the ui
unify buttons / switches 
- some buttons display a state, some buttons display an action
- kill / revive (grimoire) display an action
- dead (day menu) indicates a target state
- vote available (grimoire) indicates current state

buttons should indicate an action 
"kill" "revive" "+ status"

items that must be a status should be a toggle, but buttons are generally prefered. 

## ui simplification
Notes after dropdown in execution (day menu) are redundant
in characters the "character for <player name>" note is redundant
add some hoverable info button on evil information to explain house rules
in night menu, setting the timer can be removed. that's in the setup. add a minute as a button is good.
"close anyway" -> "force close"
dont let people with no night action block closing the night (some consideration here for people who have to submit a meaningless action, drunk, etc)
version number should be visible in the log tab
"published. publish again" -> "republish"

## review tab simplification
what's the reasoning behind having an 'add malfunction' section? anyone I want to make malfunction can have that happen through the relevant player's section

This is ok as a start
Player (note if drunk, note if poisoned)
Truth
There's no need to have a suggested vs final section. the RHS of that box should just be a selector for the other possible outcomes.
for example the oracle should have 

<Player name> oracle - poisoned
Truth: 1 dead player is evil
Suggested: <dropdown showing 2> dead players are evil

In the present version the player role is shown twice 

## canibal fixes
at the moment, when the canibal eats an evil person, they become poisoned and get some random good ability that doesn't work.
however, that they are poisoned is not indicated in the grimoire, or anywhere else. this must be fixed
there's also no need to change which ability they get durring the day. this can be removed from the day ui

## BIG FIX, seems like all characters can see the demon info lol