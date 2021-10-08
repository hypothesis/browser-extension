import HypothesisChromeExtension from './hypothesis-chrome-extension';

// TODO - Convert this module to use `chrome-api.js` to access the Chrome extension.
export function init(chrome = globalThis.chrome) {
  const browserExtension = new HypothesisChromeExtension();

  browserExtension.listen();

  if (chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(onInstalled);
  }

  // Respond to messages sent by the JavaScript from https://hyp.is.
  // This is how it knows whether the user has this Chrome extension installed.
  if (chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener(function (
      request,
      sender,
      sendResponse
    ) {
      if (request.type === 'ping') {
        sendResponse({ type: 'pong' });
      }
    });
  }

  if (chrome.runtime.requestUpdateCheck) {
    chrome.runtime.requestUpdateCheck(function () {
      chrome.runtime.onUpdateAvailable.addListener(onUpdateAvailable);
    });
  }

  /** @param {chrome.runtime.InstalledDetails} installDetails */
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
}

// In tests the `chrome` global is not defined so `init` doesn't run until
// the tests call it. In the extension it is so this runs on import.
if (typeof chrome !== 'undefined') {
  init();
}
