# Working rules for this repo

- Saved-game migration steps (`server/src/engine/migrations/`) read only the saved data. They never import live code such as `ROLES`, `DEFAULT_SETTINGS` or engine helpers; write any values they need into the step itself.
- A change that adds a role also adds, in the same change, its jinxes with roles already in the app (`JINXES` in `shared/src/roles.ts`).
- Before each commit, run `npm run typecheck`, `npm test` and `npm run build`, and make sure all three pass.
