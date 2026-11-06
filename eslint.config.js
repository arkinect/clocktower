import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const callOf = (object, property) =>
  `CallExpression[callee.object.name='${object}'][callee.property.name='${property}']`;

const noRoleIdCall = {
  selector: "CallExpression[callee.name='roleId']",
  message: 'Only rules/src/roles and rules/src/jinxes may construct a RoleId. Core code never names a role.',
};

const pureEngine = [
  { selector: callOf('Date', 'now'), message: 'rules is pure: time arrives with each command.' },
  { selector: "NewExpression[callee.name='Date']", message: 'rules is pure: time arrives with each command.' },
  { selector: callOf('Math', 'random'), message: 'rules is pure: use the seeded rng.' },
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.tsbuild/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-restricted-syntax': ['error', noRoleIdCall],
    },
  },
  {
    // The rules engine is pure. Time and seeds arrive with each command.
    files: ['packages/rules/src/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'crypto', message: 'rules is pure: seeds arrive with each command.' },
        { name: 'performance', message: 'rules is pure: time arrives with each command.' },
      ],
      'no-restricted-syntax': ['error', noRoleIdCall, ...pureEngine],
    },
  },
  {
    files: ['packages/rules/src/roles/**/*.ts', 'packages/rules/src/jinxes/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...pureEngine] },
  },
  { files: ['packages/rules/test/**/*.ts'], rules: { 'no-restricted-syntax': 'off' } },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { module: 'writable', require: 'readonly' } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
