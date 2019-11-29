'use strict';

/**
 * Returns the name of the current browser.
 *
 * @return {'chrome'|'firefox'}
 */
function browserName() {
  if (window.browser) {
    return 'firefox';
  } else {
    return 'chrome';
  }
}

module.exports = browserName;
