'use strict';

function saveOptions() {
  chrome.storage.sync.set({
    badge: document.getElementById('badge').checked,
	admin_keys: document.getElementById('admin_keys').value
  }, function(items) {
	  var status = document.getElementById('status');
	  status.textContent = 'Options saved.';
	  setTimeout(function() { status.textContent = ''; }, 1000);
	  });
}

function loadOptions() {
  chrome.storage.sync.get({
    badge: true,
	admin_keys: true
  }, function(items) {
    document.getElementById('badge').checked = items.badge;
	document.getElementById('admin_keys').value = items.admin_keys;
//	document.getElementById('gdoc_url').value = items.gdoc_url;
  });
}

document.addEventListener('DOMContentLoaded', loadOptions);
document.getElementById('badge').addEventListener('click', saveOptions);
document.getElementById('save').addEventListener('click', saveOptions);
