import * as glob from 'glob';
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import multi from '@rollup/plugin-multi-entry';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: ['tests/bootstrap.js', ...glob.sync('tests/**/*-test.js')],
  output: {
    file: 'build/tests.bundle.js',
    format: 'iife',
    name: 'testsBundle', // This just exists to suppress a build warning.
  },
  treeshake: false, // Disabled for build performance
  plugins: [
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**',
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
            exclude: ['tests/**'],
          },
        ],
      ],
    }),
    nodeResolve(),
    commonjs(),
    json(),
    multi(),
  ],
};
