'use strict';

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

const query = new URLSearchParams(window.location.search);
const message = query.get('message');

if (message) {
  const errorTextEl = /** @type {HTMLElement} */ (
    document.querySelector('.js-error-message')
  );
  errorTextEl.textContent = message;
}
