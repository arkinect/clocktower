/** Package boundaries. `npm run boundaries:selftest` proves these rules actually fail on bad code. */
module.exports = {
  forbidden: [
    {
      name: 'web-only-imports-protocol',
      severity: 'error',
      from: { path: '^web/' },
      to: { path: '(^|/)(rules|server)/' },
    },
    {
      name: 'protocol-imports-nothing-local',
      severity: 'error',
      from: { path: '^protocol/' },
      to: { path: '^(rules|server|web)/' },
    },
    {
      name: 'rules-no-node-builtins',
      severity: 'error',
      from: { path: '^rules/src/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'rules-no-server-or-web',
      severity: 'error',
      from: { path: '^rules/' },
      to: { path: '^(server|web)/' },
    },
    {
      name: 'server-not-web',
      severity: 'error',
      from: { path: '^server/' },
      to: { path: '^web/' },
    },
    {
      name: 'no-unresolvable-imports',
      severity: 'error',
      from: { path: '^(protocol|rules|server|web)/src/' },
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
