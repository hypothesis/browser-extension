import * as queryString from 'query-string';

import HypothesisChromeExtension from './hypothesis-chrome-extension';

var browserExtension;

export function init() {
  browserExtension = new HypothesisChromeExtension({
    chromeExtension: chrome.extension,
    chromeTabs: chrome.tabs,
    chromeBrowserAction: chrome.browserAction,
    chromeStorage: chrome.storage,
    extensionURL: function(path) {
      return chrome.extension.getURL(path);
    },
    isAllowedFileSchemeAccess: function(fn) {
      return chrome.extension.isAllowedFileSchemeAccess(fn);
    },
  });

  browserExtension.listen(window);
}

if (!chrome.isFakeChrome) {
  init();
}

if (chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(onInstalled);
}

// Respond to messages sent by the JavaScript from https://hyp.is.
// This is how it knows whether the user has this Chrome extension installed.
if (chrome.runtime.onMessageExternal) {
  chrome.runtime.onMessageExternal.addListener(function(
    request,
    sender,
    sendResponse
  ) {
    if (request.type === 'ping') {
      sendResponse({ type: 'pong' });
    }
  });
}

if (chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function(
    request,
    sender,
    sendResponse
  ) {
    let authUrl = request.authUrl;
    authUrl +=
      '?' +
      queryString.stringify({
        client_id: request.clientId,
        origin: chrome.identity.getRedirectURL(),
        response_type: 'code',
        state: request.state,
      });

    chrome.identity.launchWebAuthFlow({
      'url': authUrl,
      'interactive': true
    }, redirectUrl => {
      if(chrome.runtime.lastError) {
        sendResponse({error: chrome.runtime.lastError.message})
      } else {
        let data = queryString.parse(queryString.extract(redirectUrl));
        sendResponse({data: data});
      }
    });
    return true;
  });
}

if (chrome.runtime.requestUpdateCheck) {
  chrome.runtime.requestUpdateCheck(function() {
    chrome.runtime.onUpdateAvailable.addListener(onUpdateAvailable);
  });
}

function onInstalled(installDetails) {
  // The install reason can be "install", "update", "chrome_update", or
  // "shared_module_update", see:
  //
  //   https://developer.chrome.com/extensions/runtime#type-OnInstalledReason
  //
  // If we were installed (rather than updated) then trigger a "firstRun" event,
  // passing in the details of the installed extension. See:
  //
  //   https://developer.chrome.com/extensions/management#method-getSelf
  //
  if (installDetails.reason === 'install') {
    chrome.management.getSelf(browserExtension.firstRun);
  }

  browserExtension.install();
}

function onUpdateAvailable() {
  chrome.runtime.reload();
}
