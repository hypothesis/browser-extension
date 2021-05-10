'use strict';

/** Parse a query string into an object mapping param names to values. */
function parseQuery(query) {
  if (query.charAt(0) === '?') {
    query = query.slice(1);
  }
  return query.split('&').reduce(function (map, entry) {
    const keyValue = entry.split('=').map(function (e) {
      return decodeURIComponent(e);
    });
    map[keyValue[0]] = keyValue[1];
    return map;
  }, {});
}

// Detect the current OS and show approprite help.
chrome.runtime.getPlatformInfo(function (info) {
  const opts = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll('[data-extension-path]')
  );
  opts.forEach(opt => {
    if (opt.dataset.extensionPath !== info.os) {
      opt.hidden = true;
    }
  });
});

const query = parseQuery(window.location.search);
if (query.message) {
  const errorTextEl = /** @type {HTMLElement} */ (
    document.querySelector('.js-error-message')
  );
  errorTextEl.textContent = query.message;
}
