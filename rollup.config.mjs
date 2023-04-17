import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/background/index.ts',
  output: {
    file: 'build/extension.bundle.js',
    format: 'iife',
  },
  plugins: [
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**',
      extensions: ['.js', '.ts'],
    }),
    nodeResolve({ extensions: ['.js', '.ts'] }),
    commonjs(),
    json(),
  ],
};
