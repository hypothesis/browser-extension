/* eslint-disable no-console */
/* eslint-env node */
// @ts-nocheck

'use strict';

const { spawn } = require('child_process');

const { parallel, watch } = require('gulp');

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
  watch('node_modules/hypothesis', { events: 'all' }, build);
}

function watchSrc() {
  watch('src', { events: 'all' }, build);
}

exports.watch = parallel(build, watchClient, watchSrc);
