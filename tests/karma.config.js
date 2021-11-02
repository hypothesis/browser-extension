'use strict';

/* global __dirname, process */

const path = require('path');

let chromeFlags = [];

process.env.CHROME_BIN = require('puppeteer').executablePath();

if (process.env.RUNNING_IN_DOCKER) {
  // In Docker, the tests run as root, so the sandbox must be disabled.
  chromeFlags.push('--no-sandbox');

  // Disable `/dev/shm` usage as this can cause Chrome to fail to load large
  // HTML pages, such as the one Karma creates with all the tests loaded.
  //
  // See https://github.com/GoogleChrome/puppeteer/issues/1834 and
  // https://github.com/karma-runner/karma-chrome-launcher/issues/198.
  chromeFlags.push('--disable-dev-shm-usage');

  // Use Chromium from Alpine packages. The one that Puppeteer downloads won't
  // load in Alpine.
  process.env.CHROME_BIN = 'chromium-browser';
}

module.exports = function (config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: './',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['mocha', 'chai', 'sinon', 'source-map-support'],

    // list of files / patterns to load in the browser
    files: [
      { pattern: '../build/tests.bundle.js', type: 'module' },
      { pattern: '../build/*.js.map', included: false },
    ],

    mochaReporter: {
      // Display a helpful diff when comparing complex objects
      // See https://www.npmjs.com/package/karma-mocha-reporter#showdiff
      showDiff: true,
      // Only show the total test counts and details for failed tests
      output: 'minimal',
    },

    coverageIstanbulReporter: {
      dir: path.join(__dirname, '../coverage'),
      reports: ['json', 'html'],
      'report-config': {
        json: { subdir: './' },
      },
    },

    // Use https://www.npmjs.com/package/karma-mocha-reporter
    // for more helpful rendering of test failures
    reporters: ['mocha', 'coverage-istanbul'],

    // web server port
    port: 9877,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: true,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['ChromeHeadless_Custom'],

    customLaunchers: {
      ChromeHeadless_Custom: {
        base: 'ChromeHeadless',
        flags: chromeFlags,
      },
    },

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: false,
  });
};
