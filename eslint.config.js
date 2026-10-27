import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
