'use strict';

/* global __dirname, process */

let chromeFlags = [];

if (process.version.startsWith('v14.')) {
  // See https://github.com/puppeteer/puppeteer/issues/5719
  console.warn(
    'Using system Chrome instead of Puppeteer due to issue with Node 14'
  );
} else {
  process.env.CHROME_BIN = require('puppeteer').executablePath();
}

// On Travis and in Docker, the tests run as root, so the sandbox must be
// disabled.
if (process.env.TRAVIS || process.env.RUNNING_IN_DOCKER) {
  chromeFlags = ['--no-sandbox'];
}

if (process.env.RUNNING_IN_DOCKER) {
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
    frameworks: ['browserify', 'mocha', 'chai', 'sinon'],

    // list of files / patterns to load in the browser
    files: [
      {
        pattern: './settings.json',
        included: false,
      },
      './bootstrap.js',
      './background/*.js',
    ],

    // list of files to exclude
    exclude: [],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      '../src/background/*.js': ['browserify'],
      './**/*.js': ['browserify'],
    },

    browserify: {
      debug: true,
      transform: [
        [
          'babelify',
          {
            extensions: ['.js'],
            plugins: [['mockable-imports', { excludeDirs: ['tests'] }]],

            // Enable Babel to load configuration from the `.babelrc` file when
            // processing source files outside of the `tests/` directory.
            root: `${__dirname}/../`,
          },
        ],
      ],
    },

    mochaReporter: {
      // Display a helpful diff when comparing complex objects
      // See https://www.npmjs.com/package/karma-mocha-reporter#showdiff
      showDiff: true,
      // Only show the total test counts and details for failed tests
      output: 'minimal',
    },

    // Use https://www.npmjs.com/package/karma-mocha-reporter
    // for more helpful rendering of test failures
    reporters: ['mocha'],

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
