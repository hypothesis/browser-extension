import hypothesisBase from 'eslint-config-hypothesis/base';
import hypothesisTS from 'eslint-config-hypothesis/ts';
import globals from 'globals';

export default [
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

  ...hypothesisBase,
  ...hypothesisTS,

  {
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
];
