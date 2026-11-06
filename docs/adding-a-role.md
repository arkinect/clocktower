# Adding a role

Add one file under `packages/rules/src/roles/<type>/`, register it in `roles/index.ts`, and add
`packages/rules/test/roles/<role>.test.ts`. The core, protocol and client need no change unless the role needs a new
kind of hook or a custom panel.
