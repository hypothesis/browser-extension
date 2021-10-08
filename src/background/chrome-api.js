/**
 * This module provides a wrapper around the Chrome / WebExtension APIs that
 * the extension uses.
 *
 * It has several purposes:
 *  - Provide a Promise-returning interface for all async APIs
 *  - Abstract over the differences between different browsers
 *  - Provide a seam that can be easily mocked in tests
 */

import settings from './settings';

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
   * Cache of Promise-ified APIs. This is used so that APIs which are looked up
   * on-demand, eg. because they are optional and may not exist when `getChromeAPI`
   * is first called, are only created once.
   *
   * @type {Map<Function, any>}
   */
  const cache = new Map();

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
  const promisify = fn => {
    const cached = cache.get(fn);
    if (cached) {
      return cached;
    }

    return (...args) => {
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

  const browserAction = chrome.browserAction ?? chrome.action;

  return {
    browserAction: {
      onClicked: browserAction.onClicked,
      setBadgeBackgroundColor: promisify(browserAction.setBadgeBackgroundColor),
      setBadgeText: promisify(browserAction.setBadgeText),

      // @ts-ignore - Ignore an incorrect typing error about setIcon's callback
      setIcon: promisify(browserAction.setIcon),

      setTitle: promisify(browserAction.setTitle),
    },

    extension: {
      isAllowedFileSchemeAccess: promisify(
        chrome.extension.isAllowedFileSchemeAccess
      ),
    },

    management: {
      getSelf: promisify(chrome.management.getSelf),
    },

    runtime: {
      getURL: chrome.runtime.getURL,
      onMessageExternal: chrome.runtime.onMessageExternal,
      onInstalled: chrome.runtime.onInstalled,
      onUpdateAvailable: chrome.runtime.onUpdateAvailable,
      reload: chrome.runtime.reload,

      // Firefox (as of v92) does not support `requestUpdateCheck`.
      requestUpdateCheck: chrome.runtime.requestUpdateCheck
        ? promisify(chrome.runtime.requestUpdateCheck)
        : null,
    },

    permissions: {
      getAll: promisify(chrome.permissions.getAll),
      request: promisify(chrome.permissions.request),
    },

    tabs: {
      create: promisify(chrome.tabs.create),
      get: promisifyAlt(chrome.tabs.get),
      onCreated: chrome.tabs.onCreated,
      onReplaced: chrome.tabs.onReplaced,
      onRemoved: chrome.tabs.onRemoved,
      onUpdated: chrome.tabs.onUpdated,
      query: promisifyAlt(chrome.tabs.query),
      update: promisify(chrome.tabs.update),

      // Manifest V2 only.
      executeScript: promisifyAlt(chrome.tabs.executeScript),
    },

    // Manifest V3 only.
    scripting: {
      executeScript: chrome.scripting?.executeScript,
    },

    storage: {
      // Methods of storage areas (sync, local, managed) need to be bound.
      // Standalone functions in Chrome API namespaces do not.
      sync: {
        get: promisify(chrome.storage.sync.get.bind(chrome.storage.sync)),
      },
    },

    // APIs that require optional permissions.
    //
    // These are resolved on-demand because the `chrome.<namespace>` properties
    // will not exist unless the extension has the required permissions.
    //
    // If a permission is revoked, the property remains accessible until the
    // page/worker is reloaded, but calling APIs may fail.

    get webNavigation() {
      return {
        getAllFrames: promisifyAlt(chrome.webNavigation.getAllFrames),
      };
    },
  };
}

/**
 * Entry point for browser APIs.
 *
 * This has the same shape as the `chrome` or `browser` object.
 */
export const chromeAPI = getChromeAPI();

// The functions below are wrappers around the extension APIs for scripting
// which abstract over differences between browsers (eg. Manifest V2 vs Manifest V3)
// and provide a simpler and more strongly typed interface.

/**
 * Generate a string of code which can be eval-ed to produce the same result
 * as invoking `func` with `args`.
 *
 * @param {Function} func
 * @param {any[]} args
 */
function codeStringForFunctionCall(func, args) {
  return `(${func})(${args.map(arg => JSON.stringify(arg)).join(',')})`;
}

/**
 * Execute a JavaScript file within a tab.
 *
 * @param {object} options
 *   @param {number} options.tabId
 *   @param {number} [options.frameId]
 *   @param {string} options.file - Path to the script within the extension
 * @return {Promise<unknown>}
 */
export async function executeScript(
  { tabId, frameId, file },
  chromeAPI_ = chromeAPI
) {
  if (settings.manifestV3) {
    /** @type {chrome.scripting.InjectionTarget} */
    const target = { tabId };
    if (frameId) {
      target.frameIds = [frameId];
    }
    const results = await chromeAPI_.scripting.executeScript({
      target,
      files: [file],
    });
    return results[0].result;
  }

  const result = await chromeAPI_.tabs.executeScript(tabId, { frameId, file });
  return result[0];
}

/**
 * Execute a JavaScript function within a tab.
 *
 * @template {unknown[]} Args
 * @template Result
 * @param {object} options
 * @param {number} options.tabId
 * @param {number} [options.frameId]
 * @param {(...args: Args) => Result} options.func - Function to execute. This
 *   must be self-contained (ie. not reference any identifiers from the enclosing
 *   scope).
 * @param {Args} options.args - Arguments to pass to `func`. These must be
 *   JSON-serializable.
 * @return {Promise<Result>}
 */
export async function executeFunction(
  { tabId, frameId, func, args },
  chromeAPI_ = chromeAPI
) {
  if (settings.manifestV3) {
    /** @type {chrome.scripting.InjectionTarget} */
    const target = { tabId };
    if (frameId) {
      target.frameIds = [frameId];
    }
    const results = await chromeAPI_.scripting.executeScript({
      target,
      // @ts-expect-error - Typechecking error needs debugging.
      func,
      args,
    });
    return results[0].result;
  }

  const code = codeStringForFunctionCall(func, args);
  const result = await chromeAPI_.tabs.executeScript(tabId, { frameId, code });
  return result[0];
}
