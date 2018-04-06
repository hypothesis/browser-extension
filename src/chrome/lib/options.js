'use strict';

function saveOptions() {
  chrome.storage.sync.set({
    badge: document.getElementById('badge').checked,
    badgeEnable: document.getElementById('badge').checked,
  });
}

function loadOptions() {
  chrome.storage.sync.get({
    badge: true,
    badgeEnable: false,
  }, function(items) {
    document.getElementById('badge').checked = items.badgeEnable;
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.getElementById('badge').addEventListener('click', saveOptions);
