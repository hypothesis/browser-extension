'use strict';

/**
 * Return the checkbox that toggles whether badge requests are sent.
 */
function badgeCheckbox() {
  return /** @type {HTMLInputElement} */ (document.getElementById('badge'));
}

/**
 * Return the checkbox that toggles whether the extension is activated by default on all tabs.
 */
function activatedByDefaultCheckbox() {
  return /** @type {HTMLInputElement} */ (document.getElementById('activatedByDefault'));
}

/**
 * Return the checkbox that toggles whether badge requests are sent.
 */
function excludedUrlsInput() {
  return /** @type {HTMLInputElement} */ (document.getElementById('excludedUrls'));
}

/**
 * Return the checkbox that toggles whether badge requests are sent.
 */
function saveButton() {
  return /** @type {HTMLInputElement} */ (document.getElementById('save'));
}

function saveOptions() {
  chrome.storage.sync.set({
    badge: badgeCheckbox().checked,
    activatedByDefault: activatedByDefaultCheckbox().checked,
    excludedUrls: excludedUrlsInput().value
  });
}

function loadOptions() {
  chrome.storage.sync.get(
    {
      badge: true,
      activatedByDefault: false,
      excludedUrls: ''
    },
    items => {
      badgeCheckbox().checked = items.badge;
      activatedByDefaultCheckbox().checked = items.activatedByDefault;
      excludedUrlsInput().value = items.excludedUrls;
    },
  );
}

document.addEventListener('DOMContentLoaded', loadOptions);
saveButton().addEventListener('click', saveOptions);
