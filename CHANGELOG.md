# Changelog

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
