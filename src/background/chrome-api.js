/**
 * This module provides a wrapper around the Chrome / WebExtension APIs that
 * the extension uses.
 *
 * It has several purposes:
 *  - Provide a Promise-returning interface for all async APIs
 *  - Abstract over the differences between different browsers
 *  - Provide a seam that can be easily mocked in tests
 */

/**
 * Wrap the browser APIs exposed via the `chrome` object to return promises.
 *
 * This is exposed for testing. Consumers should use {@link chromeAPI}.
 */
export function getChromeAPI(chrome = globalThis.chrome) {
  // In the test environment, the `chrome` global may not exist. This is ignored
  // for the purposes of determining the return type.
  if (typeof chrome === 'undefined') {
    return /** @type {never} */ (null);
  }

  /**
   * @template Result
   * @typedef {(r: Result) => void} Callback
   */

  /**
   * Convert an async callback-accepting Chrome API to a Promise-returning version.
   *
   * TypeScript may complain if the API has a Manifest V3-only overload that
   * returns a Promise. Use {@link promisifyAlt} as a workaround.
   *
   * @template {any[]} Args
   * @template Result
   * @param {(...args: [...Args, Callback<Result>]) => void} fn
   * @return {(...args: Args) => Promise<Result>}
   */
  const promisify =
    fn =>
    (...args) => {
      return new Promise((resolve, reject) => {
        fn(...args, (/** @type {Result} */ result) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(lastError);
          } else {
            resolve(result);
          }
        });
      });
    };

  /**
   * @template {any[]} Args
   * @template Result
   * @param {(...args: Args) => Promise<Result>} fn
   * @return {(...args: Args) => Promise<Result>}
   */
  const promisifyAlt = fn => {
    // @ts-ignore
    return promisify(fn);
  };

  return {
    browserAction: {
      onClicked: chrome.browserAction.onClicked,
      setBadgeBackgroundColor: promisify(
        chrome.browserAction.setBadgeBackgroundColor
      ),
      setBadgeText: promisify(chrome.browserAction.setBadgeText),
      setIcon: promisify(chrome.browserAction.setIcon),
      setTitle: promisify(chrome.browserAction.setTitle),
    },

    extension: {
      isAllowedFileSchemeAccess: promisify(
        chrome.extension.isAllowedFileSchemeAccess
      ),
    },

    runtime: {
      getURL: chrome.runtime.getURL,
    },

    tabs: {
      create: promisify(chrome.tabs.create),
      get: promisifyAlt(chrome.tabs.get),
      executeScript: promisify(chrome.tabs.executeScript),
      onCreated: chrome.tabs.onCreated,
      onReplaced: chrome.tabs.onReplaced,
      onRemoved: chrome.tabs.onRemoved,
      onUpdated: chrome.tabs.onUpdated,
      query: promisifyAlt(chrome.tabs.query),
      update: promisify(chrome.tabs.update),
    },

    storage: {
      // Methods of storage areas (sync, local, managed) need to be bound.
      // Standalone functions in Chrome API namespaces do not.
      sync: {
        get: promisify(chrome.storage.sync.get.bind(chrome.storage.sync)),
      },
    },
  };
}

/**
 * Entry point for browser APIs.
 *
 * This has the same shape as the `chrome` or `browser` object.
 */
export const chromeAPI = getChromeAPI();
