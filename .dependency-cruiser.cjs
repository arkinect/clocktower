/** Package boundaries. `npm run boundaries:selftest` proves these rules actually fail on bad code. */
module.exports = {
  forbidden: [
    {
      name: 'web-only-imports-protocol',
      severity: 'error',
      from: { path: '^packages/web/' },
      to: { path: '(^|/)(rules|server)/' },
    },
    {
      name: 'protocol-imports-nothing-local',
      severity: 'error',
      from: { path: '^packages/protocol/' },
      to: { path: '^packages/(rules|server|web)/' },
    },
    {
      name: 'rules-no-node-builtins',
      severity: 'error',
      from: { path: '^packages/rules/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'rules-no-server-or-web',
      severity: 'error',
      from: { path: '^packages/rules/' },
      to: { path: '^packages/(server|web)/' },
    },
    {
      name: 'server-not-web',
      severity: 'error',
      from: { path: '^packages/server/' },
      to: { path: '^packages/web/' },
    },
    {
      name: 'no-unresolvable-imports',
      severity: 'error',
      from: { path: '^packages/(protocol|rules|server|web)/src/' },
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(node_modules|dist|\\.tsbuild|coverage)/' },
    tsPreCompilationDeps: true,
    preserveSymlinks: false,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
