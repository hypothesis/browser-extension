#!/usr/bin/env node

/**
 * Outputs a JSON object representing the extension settings based on a settings
 * file and the package environment.
 */

'use strict';

const path = require('path');
const gitDescribeSync = require('git-describe').gitDescribeSync;

// Suppress (expected) EPIPE errors on STDOUT
process.stdout.on('error', err => {
  if (err.code === 'EPIPE') { process.exit(); }
});

/**
 * getVersion fetches the current version from git, applying the following
 * rules:
 *
 * - If buildType is 'production' and the git state is not clean, throw an error
 * - Set the version number to X.Y.Z.W, where X.Y.Z is the last tagged release
 *   and W is the number of commits since that release.
 * - If the buildType is 'production', set the version name to "Official Build",
 *   otherwise set it to a string of the form "gXXXXXXX[.dirty]" to reflect the
 *   exact commit and state of the repository.
 */
function getVersion(buildType) {
  const gitInfo = gitDescribeSync();

  if (buildType === 'production' && gitInfo.dirty) {
    throw new Error('cannot create production build with dirty git state!');
  }

  const version = `${gitInfo.semver}.${gitInfo.distance}`;
  let versionName = 'Official Build';

  if (buildType !== 'production') {
    versionName = `${gitInfo.hash}${gitInfo.dirty ? '.dirty' : ''}`;
  }

  return {version, versionName};
}

if (process.argv.length !== 3) {
  console.error('Usage: %s <settings.json>', path.basename(process.argv[1]));
  process.exit(1);
}

const settings = require(path.join(process.cwd(), process.argv[2]));
const settingsOut = Object.assign({}, settings, getVersion(settings.buildType));

console.log(JSON.stringify(settingsOut));
