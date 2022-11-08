import glob from 'glob';
import alias from '@rollup/plugin-alias';
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import multi from '@rollup/plugin-multi-entry';
import { nodeResolve } from '@rollup/plugin-node-resolve';

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
