# Adding a role

1. Write `packages/rules/src/roles/<role>.ts`. The folder is flat: the character type is a field of the role, not a
   folder. Start from the character's wiki page and its jinxes. [mechanics.md](mechanics.md) lists the primitives each
   official character needs.
2. Import it in `packages/rules/src/roles/index.ts` and add it to `SHEET`, at its place in sheet order. That registers
   the role and puts it on the default script.
3. Add its icon as `packages/web/public/icons/<role_id>.png`, named by the role id (`al_hadikhia.png`). If it does not
   come from a source [NOTICE.md](../NOTICE.md) already names, add the source there.
4. Add `packages/rules/test/roles/<role>.test.ts`.
5. A jinx with a role already in the app is one file under `packages/rules/src/jinxes/`, added to the list in
   `jinxes/index.ts`.

Then update the counts written down by hand:

- the number of roles in `packages/rules/test/roles/jinxes.test.ts`, `README.md` and [role-panels.md](role-panels.md)
- the number of jinxes in `packages/rules/test/roles/jinxes.test.ts`
- the **Built** column of the role's row in [mechanics.md](mechanics.md)

`npm run check:role-ids` counts the role files itself, so it has no number to change.

The core, protocol and client need no change unless the role needs a new kind of hook or a custom panel. A role that
changes the saved game's shape (a new event kind, a new field in the state) needs `ENGINE_VERSION` raised, which
archives saved games at the next start.
