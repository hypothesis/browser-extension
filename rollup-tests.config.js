import glob from 'glob';
import alias from '@rollup/plugin-alias';
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import multi from '@rollup/plugin-multi-entry';
import replace from '@rollup/plugin-replace';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { vitestCoverageOptions } from '@hypothesis/frontend-testing/vitest';

export const excludeFromCoverage = [
  '**/node_modules/**',
  '**/test/**/*.js',
  '**/test-util/**',
];

export default {
  input: ['tests/bootstrap.js', ...glob.sync('tests/**/*-test.js')],
  output: {
    file: 'build/tests.bundle.js',
    format: 'es',
    sourcemap: true,
  },
  treeshake: false, // Disabled for build performance
  plugins: [
    alias({
      entries: [
        {
          find: '../../build/settings.json',
          replacement: '../../tests/settings.json',
        },
      ],
    }),
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**',
      extensions: ['.js', '.ts'],
      plugins: [
        [
          'mockable-imports',
          {
            excludeDirs: ['tests'],
          },
        ],
        [
          'babel-plugin-istanbul',
          {
            ...vitestCoverageOptions,
            exclude: excludeFromCoverage,
          },
        ],
      ],
    }),
    replace({
      preventAssignment: true,
      EXTENSION_TESTS: 'true',
    }),
    nodeResolve({ extensions: ['.js', '.ts'] }),
    commonjs(),
    json(),
    multi(),
  ],
};
