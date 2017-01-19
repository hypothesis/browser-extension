#!/usr/bin/env node

/**
 * Outputs a JSON object representing the appropriate template context for the
 * `app.html` file.
 */

'use strict';

const path = require('path');

const stylesheets = [
  'styles/angular-csp.css',
  'styles/angular-toastr.css',
  'styles/icomoon.css',
  'styles/katex.min.css',
  'styles/app.css',
];

const scripts = [
  'scripts/raven.bundle.js',
  'scripts/angular.bundle.js',
  'scripts/katex.bundle.js',
  'scripts/showdown.bundle.js',
  'scripts/polyfills.bundle.js',
  'scripts/unorm.bundle.js',
  'scripts/app.bundle.js',
];

const manifest = require('../node_modules/hypothesis/build/manifest.json');

function appSettings(settings) {
  let result = {};
  result.apiUrl = settings.apiUrl;
  result.serviceUrl = settings.serviceUrl;
  result.release = settings.version;
  if (settings.websocketUrl) {
    result.websocketUrl = settings.websocketUrl;
  }
  if (settings.sentryPublicDSN) {
    result.raven = {
      dsn: settings.sentryPublicDSN,
      release: settings.version,
    };
  }
  if (settings.googleAnalytics) {
    result.googleAnalytics = settings.googleAnalytics;
  }
  return result;
}

if (process.argv.length !== 3) {
  console.error('Usage: %s <settings.json>', path.basename(process.argv[1]));
  process.exit(1);
}

const settings = require(path.join(process.cwd(), process.argv[2]));

console.log(JSON.stringify({
  'stylesheets': stylesheets.map(s => '/public/' + manifest[s]),
  'scripts': scripts.map(s => '/public/' + manifest[s]),
  'settings': JSON.stringify(appSettings(settings)),
}));
