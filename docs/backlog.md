# Backlog

Things we know about and chose not to do yet. Newest first.

## Engine paths the console has no control for

These are kept on purpose, so a future character is a role file and not a change to the core. Each still needs a
console control before a character that relies on it can be run:

- `record_nomination`, `record_vote`, `record_statement` and `record_broke_madness`. The console stopped sending them
  in 0.5.1. Vote weights (Bureaucrat, Thief, Voudon, Legion), nomination history (Town Crier, Gunslinger) and madness
  (Cerenovus, Harpy, Mutant) all need a recorder on the Day tab.
- `adjust_malfunctions`, which corrects the count the Mathematician is given. The Review tab has no control for it.
- `neededTonight` on a day action. The Flowergirl sets it and the console does not read it.
- Travellers, Fabled and Loric. The commands and panels exist and are tested against throwaway characters, but no such
  character is built, so none has been played from the console.

## Unused parts that need an engine version to remove

Removing either changes the shape of the saved game, so `ENGINE_VERSION` goes up and saved games are archived at the
next start. Do both in one release:

- `seen_role` and `hasSeenRole`. No client sends the command and nothing reads the field.
- Prompts: `ctx.prompt`, `resolve_prompt`, `onPrompt` and `state.prompts`. No character in `mechanics.md` needs one
  and no test raises one. Day actions with `decide` do the same job.

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
