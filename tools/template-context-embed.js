#!/usr/bin/env node

/**
 * Outputs a JSON object representing the appropriate template context for the
 * `embed.js` file.
 */

'use strict';

const stylesheets = [
  'styles/icomoon.css',
  'styles/inject.css',
  'styles/pdfjs-overrides.css',
];

const scripts = [
  'scripts/polyfills.bundle.js',
  'scripts/jquery.bundle.js',
  'scripts/injector.bundle.js',
];

const manifest = require('../node_modules/hypothesis/build/manifest.json');

console.log(JSON.stringify({
  'stylesheets': stylesheets.map(s => '/public/' + manifest[s]),
  'scripts': scripts.map(s => '/public/' + manifest[s]),
}));
