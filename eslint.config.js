import hypothesis from 'eslint-config-hypothesis';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '.yalc/**/*',
      '.yarn/**/*',
      'build/**/*',
      'dist/**/*',
      '**/vendor/**/*.js',
      '**/coverage/**/*',
      'docs/_build/*',
      // TODO - Lint these files
      'rollup*.config.js',
    ],
  },
  ...hypothesis,
  ...tseslint.configs.recommended,
  {
    rules: {
      'prefer-arrow-callback': ['error', { allowNamedFunctions: true }],
      'object-shorthand': ['error', 'properties'],

      // Upgrade TS rules from warning to error.
      '@typescript-eslint/no-unused-vars': 'error',

      // Disable TS rules that we dislike.
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-this-alias': 'off',

      // Enforce consistency in cases where TypeScript supports old and new
      // syntaxes for the same thing.
      //
      // - Require `<var> as <type>` for casts
      // - Require `import type` for type imports. The corresponding rule for
      //   exports is not enabled yet because that requires setting up type-aware
      //   linting.
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
    languageOptions: {
      globals: {
        chrome: false,
      },
    },
  },

  // Entry points which get loaded as non-module scripts.
  {
    files: ['src/unload-client.js'],
    rules: {
      strict: ['error', 'global'],
    },
    languageOptions: {
      parserOptions: {
        sourceType: 'script',
      },
    },
  },

  // CommonJS scripts which run in Node
  {
    files: ['tests/karma.config.cjs'],
    rules: {
      strict: ['error', 'global'],
    },
    languageOptions: {
      parserOptions: {
        sourceType: 'script',
      },
      globals: {
        ...globals.node,
      },
    },
  },

  // ESM scripts which run in Node
  {
    files: ['tools/*.js'],
    rules: {
      'no-console': 'off',
    },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
