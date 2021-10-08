import { chromeAPI } from './chrome-api';
import HypothesisChromeExtension from './hypothesis-chrome-extension';

export async function init() {
  const browserExtension = new HypothesisChromeExtension();

  browserExtension.listen();

  chromeAPI.runtime.onInstalled.addListener(async installDetails => {
    // Check whether this is the inital installation or an update of an existing
    // installation.
    if (installDetails.reason === 'install') {
      const extensionInfo = await chromeAPI.management.getSelf();
      browserExtension.firstRun(extensionInfo);
    }
    browserExtension.install();
  });

  // Respond to messages sent by the JavaScript from https://hyp.is.
  // This is how it knows whether the user has this Chrome extension installed.
  chromeAPI.runtime.onMessageExternal.addListener(
    (request, sender, sendResponse) => {
      if (request.type === 'ping') {
        sendResponse({ type: 'pong' });
      }
    }
  );

  chromeAPI.runtime.requestUpdateCheck?.().then(() => {
    chromeAPI.runtime.onUpdateAvailable.addListener(() =>
      chromeAPI.runtime.reload()
    );
  });
}

// In tests the `chrome` global is not defined so `init` doesn't run until
// the tests call it. In the extension it is so this runs on import.
if (typeof chrome !== 'undefined') {
  init();
}
