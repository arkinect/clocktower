# Changelog

## v0.5.1

The Storyteller console feels like 0.4.2 again.

- The Storyteller console is dark again, whatever the laptop's setting.
- Once the game starts, Lobby, Setup, Story and Log move into a More menu.
- The Day tab records what the night needs, as before 0.5.0: deaths, dead votes, the execution and each role's facts,
  which now show their answer. It no longer records nominations, votes or statements.
- An execution marks the player dead at once, but the Cannibal, Mastermind and Mayor react only when the night starts.
  Reviving the player in the Grimoire first undoes it.
- The Devil's Advocate's player, the Fool, a sober Sailor and the Tea Lady's neighbours survive an execution by
  themselves: choose them as executed as usual, and they stay alive.
- If a fact the night needs wasn't recorded (the Flowergirl's answer, the Moonchild's choice), that night's Review asks
  for it before dawn can be published.
- The Virgin, Golem and Psychopath are day abilities. The Psychopath's kill respects protections.
- Setup has no alignment per player, except for a Traveller, whose alignment the Storyteller chooses. Every other
  character starts with its own alignment, and the Grimoire can change it.
- The Balloonist's +0 or +1 Outsider is chosen in Setup, as the Godfather's is.
- When the Demon dies during the day, the Scarlet Woman becomes the Demon as the night starts (unless drunk or poisoned)
  and acts that night. There's no day prompt.
- "Good/Evil may have won" cards are hidden for now. End the game from the Grimoire.
- **New game (erase)** is back, in the Grimoire and the Lobby: it removes every player, the Storyteller included, and
  resets the script.
- The Story tab is a table per night again: role, drunk or poisoned, targets and outcome, information, and the truth
  when the information was false.
- Each seat in the Grimoire has the full controls again: alignment, kill and revive, dead vote, ability used,
  conditions, and a confirmed character change.
- **Saved games carry over.** Update between games if you can: a game saved during a day with an execution already
  recorded under 0.5.0 would have that execution's triggers fire a second time at dusk.

## v0.5.0

The app has been rewritten from the ground up: a new rules engine where each character is one file, a new server, and
new phone and Storyteller apps.

**Before you update:** games in progress on the old version end, and everyone rejoins once with the site password.

- Games now live in the `clocktower-data` volume. The `data/` folder is left as it is, for a rollback. See
  [Rolling back](README.md#rolling-back).
- All 55 characters and 14 jinxes carry over. The rulings that changed are in [docs/rulings.md](docs/rulings.md).
- Up to 30 players a game.
- The Storyteller's Grimoire is a circle of seats.
- Strict-Transport-Security is off unless you set `HSTS=1`.
