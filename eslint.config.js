// Configuration ESLint.
//
// Le script `npm run lint` existait mais echouait : ni ESLint ni configuration
// n'etaient installes. Le jeu de regles reste volontairement resserre sur ce
// qui attrape de vrais defauts — code mort, dependances de hooks manquantes,
// variables inutilisees — plutot que sur la mise en forme.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {ignores: ['dist', 'node_modules', '.claude']},
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {'react-hooks': reactHooks},
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', {allow: ['warn', 'error']}],
      eqeqeq: ['error', 'smart'],
    },
  },
);
