#!/usr/bin/env node

/**
 * Outputs a JSON object representing the appropriate template context for the
 * `app.html` file.
 */

'use strict';

const path = require('path');

function appSettings(settings) {
  let result = {};
  result.apiUrl = settings.apiUrl;
  result.assetRoot = '/client/';
  result.authDomain = settings.authDomain;
  result.serviceUrl = settings.serviceUrl;
  result.release = settings.version;
  result.appType = settings.appType || '';
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
  if (settings.oauthClientId) {
    result.oauthClientId = settings.oauthClientId;
    result.oauthEnabled = settings.oauthEnabled;
  }
  return result;
}

if (process.argv.length !== 3) {
  console.error('Usage: %s <settings.json>', path.basename(process.argv[1]));
  process.exit(1);
}

const settings = require(path.join(process.cwd(), process.argv[2]));

console.log(JSON.stringify({
  'settings': JSON.stringify(appSettings(settings)),
}));
