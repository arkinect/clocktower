# Test gaps

What is left to do so that the tests of all three packages (`rules`, `server`, `web`) are good all the way through, with
no shallow spots. Measured on 25 November 2026, on the `test-audit` branch.

## Start here

**If you are an AI that was handed this file with no other instruction, this is the job: do all of it.** Close the gaps
below in the given [order](#order), fix the bugs you find on the way, and stop when every box under
[Done means](#done-means) is ticked.

- **Work without asking.** The owner wants to hand this over and come back to it finished. Where this file leaves a
  choice, make it and note it under [Progress](#progress). Where it says the owner decides, write the question under
  [For the owner](#for-the-owner), leave that one thing as it is, and carry on with the rest.
- **It won't fit in one sitting.** Read [Progress](#progress) first and go on from there. Update it after every file or
  screen, so another instance can pick up from this file alone.
- **Check the numbers before trusting them.** They were true at the commit they were measured on. Line numbers move.
- **Git:** stay on the branch you are on, unless it is `main`: then make a new one. Don't commit, push or open a pull
  request unless the owner has told you to. The work is kept in the working tree, so never reset, stash or check out
  over it, and look at `git status` before you start.
- **Finish with a report:** the figures before and after, the bugs found and fixed, what is under
  [For the owner](#for-the-owner), and anything that could not be done, said plainly. Leave this file for the owner to
  delete.

## Background

An audit has just removed the duplicates and the tests of removed features (1,414 tests became 898) and rebuilt the
random games. It did not look for missing tests. That is this job.

## Where it stands

| Package  | Tests | Lines           | Branches         | Mutation score                   |
| -------- | ----- | --------------- | ---------------- | -------------------------------- |
| `rules`  | 631   | 99.0% (82 left) | 95.7% (169 left) | about 71% (673 of 943, a sample) |
| `server` | 91    | 94.2% (82 left) | 93.8% (39 left)  | never measured                   |
| `web`    | 176   | 65.5% (see web) | 82.3%            | never measured                   |

`protocol` has no tests of its own. Its schemas are tested from `rules/test/core`, and its coverage reads 0 because
nothing measures it from there.

**The main lesson: a covered line is not a tested line.** `rules` runs 99% of its lines, yet nearly 3 in 10 deliberate
mistakes in it were caught by no hand-written test. Coverage finds the code no test runs. Only mutation testing finds
the code whose result no test checks. Use both.

## Rules for the work

- **Do not grow the suite for its own sake.** The owner found a suite of over 1,000 tests too big. Prefer, in this order: a
  stronger assertion in an existing test, one more case in an existing table or loop, a new `it`. A looped case must
  name itself when it fails: give `expect` a label.
- **A test states behaviour.** It should read as a rule of the game or of the app. Never copy the implementation into
  the expected value, never export something only for a test, and don't chase one mutant with one test. A group of
  survivors in one function usually shows one missing rule.
- **Every new test must be seen to fail.** Break the line it is for, watch it fail, and put the line back. Do that in a
  clone, so an interrupted run never leaves the working copy broken.
- **Watch for tests that cannot fail**: an assertion on a decision or field that no longer exists, `Object.keys` on a
  `Map`, or an `expect` inside a branch or loop that never runs. The audit found several.
- **Fix the bugs you find.** Write the test that fails, fix the cause with the smallest change that is right, and list
  it under [Progress](#progress). It is a bug when the app crashes, loses or leaks something, contradicts itself, or
  breaks a rule that the role's own text, its wiki page or [rulings.md](rulings.md) states. Those decide what is right,
  not what the code now does: never write a test that keeps a wrong answer in place.
- **Don't settle what isn't settled.** Where the rules are silent or disagree, or a fix would change what people see on
  purpose, or would break saved games, it goes under [For the owner](#for-the-owner).
- **Change the source only to fix a bug**, or to pull logic out so it can be tested with nothing about it changing. List
  those under [Progress](#progress) too. No new features, dependencies or visible UI, and no code removed because no
  test reaches it.
- **Engine paths for future official roles stay, and so do their tests.** Travellers, Fabled and Loric, recording
  nominations, votes, statements and madness, prompts, and the hooks in [mechanics.md](mechanics.md) are unused on
  purpose. A gap there is closed with a throwaway character in `rules/test/framework`, not by deleting code. New
  console UI is built hidden.
- **Lil' Monsta is not a day event.** Keep it off the Day tab and out of `web/e2e/day-events.spec.ts`.
- Never add a coverage or Stryker ignore comment to get past a number. A line that truly can't be reached is
  listed with its reason (see [Survivors that are left](#survivors-that-are-left)).

### Where a test goes

| What                                               | Where                                                |
| -------------------------------------------------- | ---------------------------------------------------- |
| One role or jinx                                   | `rules/test/roles/<role>.test.ts`, `jinxes.test.ts`  |
| A topic that cuts across roles                     | `rules/test/scenarios`                               |
| Commands, saving, schemas                          | `rules/test/core`                                    |
| A hook no current role uses                        | `rules/test/framework`                               |
| A whole random game                                | `rules/test/games`                                   |
| Autoplay                                           | `rules/test/autoplay`                                |
| A screen, under the same folder as it has in `src` | `web/test/<folder>`, with views from `test/views.ts` |

`rules/test/scenario.ts` is the language most rules tests are written in. Read it first.

## How to measure

Coverage, with the uncovered lines listed: `npm run test:coverage`.

Mutation testing makes one small mistake in the code, runs the tests, and sees whether any of them fails. A mistake that
none of them notices is called a survivor. The tool is Stryker. It is not set up in the repository, and stays out of its
`package.json`. Run it **in a clone outside the repository**, because it rewrites the source in place while it runs. (It
must, as `@ct/rules` is linked to its own folder.) These steps were tried from a clean clone:

```sh
git clone <this repository> ../mutants && cd ../mutants && npm ci
npm i -D @stryker-mutator/core@8 @stryker-mutator/vitest-runner@8
cd packages/rules      # add the two files below, then:
npx stryker run --mutate "src/roles/mayor.ts"
```

`vitest.stryker.config.ts`. The random games are left out, because they are slow and only the hand-written tests are
being measured:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['test/games/**', 'test/autoplay/odds.test.ts'] },
});
```

`stryker.config.json`:

```json
{
  "testRunner": "vitest",
  "vitest": { "configFile": "vitest.stryker.config.ts" },
  "plugins": ["@stryker-mutator/vitest-runner"],
  "mutate": ["src/**/*.ts"],
  "coverageAnalysis": "perTest",
  "ignoreStatic": true,
  "inPlace": true,
  "concurrency": 8,
  "timeoutMS": 60000,
  "disableTypeChecks": true,
  "mutator": { "excludedMutations": ["StringLiteral", "ObjectLiteral", "Regex", "UpdateOperator"] },
  "reporters": ["clear-text", "json"],
  "jsonReporter": { "fileName": "mutation.json" }
}
```

- One file takes about 2 minutes, nearly all of it the first run of the tests. All of `rules/src` is 11,785 mutants,
  some 7,400 of them run. Expect about two hours. Work file by file, and do the whole package at the start and the end.
- Give `timeoutMS` room and leave the machine some cores. With a 15-second limit and every core busy, mutants timed out
  that in fact survived, and a timeout counts as caught. Rerun timeouts on their own before believing them.
- **A clone holds only what is committed.** Before every run, replace `packages/*/src` and `packages/*/test` in the clone
  with those of the working tree (delete and copy, so a removed test goes too). That also undoes a stopped run, which
  leaves the clone's source mutated. Never copy anything back.
- The four kinds left out are the second pass. In `rules` a string is often a role id, a condition or an alignment, so
  `StringLiteral` and `ObjectLiteral` matter: they were a third of the sample. Turn them on once the first pass is clean.
- `ignoreStatic` skips code that runs at import, which covers much of each role's definition (its night order, flags and
  type). The sheet-order and count tests cover part of that. Check what they miss by hand.
- The recipe has not been tried on `server` (native SQLite, real sockets) or `web` (jsdom). Start there with the files
  that need neither.

## Rules

### Survivors

A sample of 1,499 mutants (20% of those in roles and jinxes, 7% of the rest) left 943 to run. **270 were caught by no
hand-written test.** The old suite, before the audit, let the same 270 through. Many of them will turn out to change
nothing anyone could notice. The sample shows where to start, worst first. A file that isn't listed was sampled
thinly, not cleared, so do the whole package.

| File                                                | Caught | Missed |
| --------------------------------------------------- | ------ | ------ |
| `night/run.ts`                                      | 59     | 16     |
| `views/project.ts`                                  | 24     | 16     |
| `phases/autoplay.ts`                                | 26     | 15     |
| `roles/damsel.ts`                                   | 20     | 13     |
| `roles/godfather.ts`                                | 27     | 12     |
| `roles/lib.ts`                                      | 16     | 12     |
| `roles/grandmother.ts`                              | 4      | 10     |
| `setup/rules.ts`                                    | 23     | 10     |
| `phases/day.ts`                                     | 21     | 9      |
| `roles/cannibal.ts`                                 | 19     | 8      |
| `roles/moonchild.ts`                                | 20     | 7      |
| `roles/fortune-teller.ts`, `roles/virgin.ts`        | 17     | 12     |
| `roles/mezepheles.ts`, `phases/night.ts`            | 21     | 12     |
| `roles/mayor.ts`                                    | 6      | 6      |
| `roles/golem.ts`, `views/steward.ts`                | 17     | 10     |
| `abilities/define.ts`                               | 0      | 5      |
| `roles/mathematician.ts`, `roles/juggler.ts`        | 27     | 10     |
| `roles/lil-monsta.ts`, `phases/setup.ts`            | 44     | 10     |
| `roles/devils-advocate.ts`, `roles/inquisitor.ts`   | 14     | 8      |
| `night/wake.ts`, `night/story.ts`                   | 9      | 8      |
| `jinxes/al-hadikhia-mastermind.ts`, `night/info.ts` | 12     | 7      |

Low counts with a poor ratio are as telling as the long ones: `grandmother`, `mayor`, `mathematician`, `goon`
(2 caught, 3 missed), `night/story.ts` and `abilities/define.ts`. Checked in full afterwards, `mayor.ts` scores 56%:
42 caught, 33 missed, two thirds of them in the conditions of its win (lines 51 and 52) and the answer it recommends
(lines 29 and 30).

Most survivors are conditions: 138 of the first 273 were a condition replaced by `true` or `false`, and 27 a logical
operator (`&&`, `||`, `??`) swapped for another. So the missing test is usually the case where the rule does **not**
apply: the ability of someone else, the wrong night, the dead holder, the drunk one, the second time.

### Lines no test runs

Some of these are for future roles, and some are defensive. Decide for each.

| File                                                            | Lines                        |
| --------------------------------------------------------------- | ---------------------------- |
| `night/run.ts`, `night/context.ts` (prompts, for future roles)  | 749-750, 757-768 and 455-457 |
| `phases/day.ts` (answering a prompt, for future roles)          | 301-302                      |
| `night/context.ts` (the rest)                                   | 126-127, 148-149             |
| `views/steward.ts`                                              | 26-38                        |
| `views/project.ts`                                              | 63-65, 447-450               |
| `setup/deal.ts`                                                 | 50-51, 150, 195-197          |
| `phases/autoplay.ts`                                            | 332-334, 441-442             |
| `abilities/registry.ts`                                         | 40-44                        |
| `dispatch.ts` (an internal error)                               | 78-79                        |
| `model/state.ts`                                                | 355-356                      |
| `roles/grandmother.ts`, `devils-advocate.ts`, `huntsman.ts`     | 75-78, 48-50 and 45-47       |
| `roles/moonchild.ts`, `witch.ts`, `cannibal.ts`, `godfather.ts` | 108-110, 24-26, 36 and 65    |
| `night/info.ts`                                                 | 51                           |

Some of the covered lines are run only by the random games. Run coverage without `test/games` once, and give each rule
that appears only then a test of its own.

### Random games

In good shape. They play full tables with every Storyteller command but `resolve_prompt`, and check hidden information,
saving, replay, and that a kept resolution is what a fresh one would be. A prompt could be played too, with a
throwaway character that asks one. `storyteller-games.test.ts` and `autoplay-games.test.ts` play only legal games, which
is their point. Leave `FUZZ_GAMES` as it is: variety found bugs here, and volume did not.

## Server

1. **Run the mutation check.** It has never been done. Start with `limits/limits.ts`, `cards/rules.ts`,
   `auth/sessions.ts` and `games/manager.ts`, which need no sockets.
2. **Close the lines no test runs:**

   | File               | Lines                                          |
   | ------------------ | ---------------------------------------------- |
   | `ws/hub.ts`        | 72-74, 107-109, 142, 153-154, 188-189, 234-242 |
   | `app.ts`           | 78-90, 92-94                                   |
   | `http/routes.ts`   | 93-96, 109-110, 145-146                        |
   | `limits/limits.ts` | 89-91                                          |
   | `cards/tables.ts`  | 98, 286                                        |
   | `main.ts`          | all 33: start it once, as a process            |

3. **Make the card tables deterministic.** `cards-tables.test.ts` uses real timers of a few milliseconds, and two
   branches (`cards/rules.ts:208`, `cards/tables.ts:100`) are covered on some runs and not on others. Use fake timers,
   or give those two their own tests.

## Web

This is the biggest gap.

1. **Measure the right files.** The 65.5% counts `e2e/*.ts` and `playwright.config.ts`, 182 lines that are not the app.
   Set `coverage.include` to `src/**`. The app alone is 67.6%, with about 1,856 lines to go.
2. **Test what every screen stands on:** `app/store.tsx`, `app/router.ts`, `app/App.tsx` and `app/http.ts`. Other tests
   mock the store, so a mistake in it is invisible today. Test it through a fake socket, as `test/app/socket.test.ts`
   does, and cover: the first connection, a lost one and its return, a refused command, two commands at once, a stale
   app version, a removed session, and the wrong password.
3. **Then the screens, by lines that no unit test runs:**

   | File                                    | Not run              |
   | --------------------------------------- | -------------------- |
   | `storyteller/Setup.tsx`                 | 193 of 521           |
   | `player/PlayerApp.tsx`                  | 185 of 269           |
   | `player/Join.tsx`                       | 158 of 158           |
   | `storyteller/Day.tsx`                   | 105 of 626           |
   | `storyteller/Night.tsx`                 | 103 of 105           |
   | `storyteller/Review.tsx`                | 57 of 401            |
   | `storyteller/Story.tsx`, `Lobby.tsx`    | 46 of 169, 45 of 64  |
   | `player/parts.tsx`                      | 24 of 145            |
   | `steward/Lobby.tsx`, `Night.tsx`        | 19 of 54, 17 of 71   |
   | `storyteller/Grimoire.tsx`, `ui/ui.tsx` | 18 of 382, 18 of 212 |
   | the rest of `steward` and `storyteller` | under 10 each        |

   Branches matter as much as lines: `Review.tsx` has 52 that no test takes, `Grimoire.tsx` 37 and `Day.tsx` 29.

4. **The games players wait with:** `games/MiniGame.tsx` (203), `Game2048.tsx` (189), `CrazyEights.tsx` (128) and
   `NightGames.tsx` (34), none of which any unit test runs. Moving and merging tiles, scoring, and losing are logic:
   test that as plain functions. Drawing needs only a check that it shows up, and gives way when the player has
   something to do.
5. **Run the mutation check** on `scriptFile.ts`, `circle.ts`, `router.ts`, `socket.ts`, the store, and `Picker.tsx`.
   For the rest of the screens coverage and review are enough.
6. **Browser tests.** The 6 in `web/e2e` count towards no coverage figure, so a screen they walk through still reads as
   unrun. They are the proof that the pieces fit. They are not a reason to skip the unit test of a rule a screen decides.
   A good test finds things as a person does, by role and label, and checks the command that is sent.

## For the owner

Questions that aren't settled. Don't test these as right or wrong until they are. Add to the list.

- Forcing a game back to setup (Grimoire, "Force a phase") clears the old day and night records when the first night
  begins. Nothing in either command resets who is dead, conditions, the suggested ends of the game, or a Traveller who
  was exiled. "Play again" resets them all. Should a forced setup too?

## Progress

Nothing done yet. Keep here, briefly: where the work stands, the next step, the figures last measured, bugs fixed
(what, where, the test), and source changed for testing.

## Survivors that are left

Every mutant still alive at the end goes in a table here: file and line, the change, and why no test should catch it.
There are three good reasons: the change makes no difference to anything anyone can see, the code guards against
something that can't happen, or the code is for a role that does not exist yet and has no throwaway character. "Hard to
test" is not one.

| Where | Change | Why |
| ----- | ------ | --- |

## Done means

Someone assessing the tests afresh should find nothing to call shallow. Check that with these, and raise the floors in
each `vitest.config.ts` (`vite.config.ts` in web) to just under what is reached, so it stays that way.

- [ ] `rules`: every line and branch is run by a hand-written test, or listed above. First pass of mutation over all of
      `src`: no unlisted survivor. Second pass, with strings and objects on: the same for `roles`, `jinxes`, `night` and
      `phases`.
- [ ] `server`: at least 98% of lines and 97% of branches, the same on five runs in a row. No unlisted survivor in
      `limits`, `cards`, `auth`, `games` and `store`.
- [ ] `web`: at least 95% of lines and 90% of branches in `src`. No unlisted survivor in the files under step 5.
- [ ] No file in any package is under 90% of lines, so a good average hides nothing. `server/src/main.ts` and
      `web/src/main.tsx` only start things, so they are exempt: run them, but a process of its own isn't counted.
- [ ] Every new test has been seen to fail. At the end, 20 of them picked at random are read again from scratch: none
      repeats another, and none can't fail.
- [ ] `npm test` takes no more than half as long again as it does now (about 70 seconds on the machine this was
      measured on), and passes ten times in a row.
- [ ] A nightly-sized run passes from a seed not used before: `FUZZ_GAMES=2000 FUZZ_SEED=<new> npm test`.
- [ ] `npm run typecheck`, `lint`, `format:check`, `boundaries`, `boundaries:selftest`, `check:role-ids` and the browser
      tests (`npm run test:e2e -w @ct/web`, after `npm run build` and `npx playwright install chromium`) pass.
- [ ] Every bug found on the way is fixed with a test, or is a question under [For the owner](#for-the-owner).
- [ ] Every figure in this file is the one last measured, and [Progress](#progress) says so.

## Order

1. Web step 1, then the full first-pass mutation run of `rules`: both give you the real list to work from.
2. `rules`, file by file, worst first.
3. `server`.
4. `web` step 2, then the rest.
5. The second pass of `rules`, and the final checks.
