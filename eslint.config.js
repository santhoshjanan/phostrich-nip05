import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      },
      globals: {
        ...globals.browser
      }
    }
  },
  {
    // Build output and vendored agent/skill tooling checked into the repo
    // (impeccable, superpowers, etc.) — not project source, don't lint it.
    ignores: [
      'build/',
      '.svelte-kit/',
      'dist/',
      'drizzle/',
      '.agent/',
      '.agents/',
      '.claude/',
      '.codex/',
      '.impeccable/',
      '.superpowers/'
    ]
  }
];
