/* eslint-disable no-console */
/* eslint-env node */
// @ts-nocheck

import { spawn } from 'node:child_process';

import * as gulp from 'gulp';

function build(cb) {
  const make = spawn('make', ['build'], { stdio: 'inherit' });
  make.on('close', code => {
    if (code !== 0) {
      cb(new Error(`make exited with status ${code}`));
    } else {
      cb(null);
    }
  });
}

function watchClient() {
  gulp.watch('node_modules/hypothesis', { events: 'all' }, build);
}

function watchSrc() {
  gulp.watch('src', { events: 'all' }, build);
}

export const watch = gulp.parallel(build, watchClient, watchSrc);
