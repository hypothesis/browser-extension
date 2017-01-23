#!/usr/bin/env node

/**
 * Outputs a JSON object representing the appropriate template context for the
 * `settings-data.js` file.
 */

'use strict';

const path = require('path');

function extensionSettings(settings) {
  let result = {};
  result.buildType = settings.buildType;
  result.apiUrl = settings.apiUrl;
  result.serviceUrl = settings.serviceUrl;
  result.appType = settings.appType || '';
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
  'settings': JSON.stringify(extensionSettings(settings)),
}));
