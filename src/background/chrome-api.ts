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

type Callback<Result> = (r: Result) => void;

/**
 * Wrap the browser APIs exposed via the `chrome` object to return promises.
 *
 * This is exposed for testing. Consumers should use {@link chromeAPI}.
 */
export function getChromeAPI(chrome = globalThis.chrome) {
  // In the test environment, the `chrome` global may not exist.
  if (typeof chrome === 'undefined') {
    // The `as never` causes this branch to be ignored when TS determines the
    // return type of this function.
    return null as never;
  }

  /**
   * Cache of Promise-ified APIs. This is used so that APIs which are looked up
   * on-demand, eg. because they are optional and may not exist when `getChromeAPI`
   * is first called, are only created once.
   */
  const cache = new Map<() => void, any>();

  /**
   * Convert an async callback-accepting Chrome API to a Promise-returning version.
   *
   * TypeScript may complain if the API has a Manifest V3-only overload that
   * returns a Promise. Use {@link promisifyAlt} as a workaround.
   *
   * This wrapper can be removed once the extension becomes Manifest V3-only.
   *
   * @param fn - The original Chrome API that accepts a callback.
   * @return Wrapped API that doesn't take a callback but returns a Promise instead
   */
  function promisify<Args extends any[], Result>(
    fn: (...args: [...Args, Callback<Result>]) => void,
  ): (...args: Args) => Promise<Result> {
    const cached = cache.get(fn);
    if (cached) {
      return cached;
    }

    return (...args) => {
      return new Promise((resolve, reject) => {
        fn(...args, (result: Result) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(lastError);
          } else {
            resolve(result);
          }
        });
      });
    };
  }

  function promisifyAlt<Args extends any[], Result>(
    fn: (...args: Args) => Promise<Result>,
  ): (...args: Args) => Promise<Result> {
    // @ts-expect-error
    return promisify(fn);
  }

  const browserAction = chrome.browserAction ?? chrome.action;

  return {
    browserAction: {
      onClicked: browserAction.onClicked,
      setBadgeBackgroundColor: promisify(browserAction.setBadgeBackgroundColor),
      setBadgeText: promisify(browserAction.setBadgeText),
      setIcon: promisify(browserAction.setIcon),
      setTitle: promisify(browserAction.setTitle),
    },

    extension: {
      isAllowedFileSchemeAccess: promisify(
        chrome.extension.isAllowedFileSchemeAccess,
      ),
    },

    management: {
      getSelf: promisify(chrome.management.getSelf),
    },

    runtime: {
      id: chrome.runtime.id,
      getURL: chrome.runtime.getURL,
      onMessage: chrome.runtime.onMessage,
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
 */
function codeStringForFunctionCall(func: () => void, args: unknown[]) {
  return `(${func})(${args.map(arg => JSON.stringify(arg)).join(',')})`;
}

export type ExecuteScriptOptions = {
  tabId: number;
  frameId?: number;
  file: string;
};

/**
 * Execute a JavaScript file within a tab.
 */
export async function executeScript(
  { tabId, frameId, file }: ExecuteScriptOptions,
  chromeAPI_ = chromeAPI,
): Promise<unknown> {
  if (settings.manifestV3) {
    const target: chrome.scripting.InjectionTarget = { tabId };
    if (frameId) {
      target.frameIds = [frameId];
    }
    const results = await chromeAPI_.scripting.executeScript({
      target,
      files: [file],
    });
    return results[0].result;
  }

  const result = (await chromeAPI_.tabs.executeScript(tabId, {
    frameId,
    file,
  })) as unknown[];
  return result[0];
}

export type ExecuteFunctionOptions<Args extends unknown[], Result> = {
  tabId: number;
  frameId?: number;

  /**
   * Function to execute. This must be self-contained (not reference any
   * identifiers from enclosing scope).
   */
  func: (...args: Args) => Result;

  /** Arguments to pass to `func`. These must be JSON-serializable. */
  args: Args;
};

/**
 * Execute a JavaScript function within a tab.
 */
export async function executeFunction<Args extends unknown[], Result>(
  { tabId, frameId, func, args }: ExecuteFunctionOptions<Args, Result>,
  chromeAPI_ = chromeAPI,
): Promise<Result> {
  if (settings.manifestV3) {
    const target: chrome.scripting.InjectionTarget = { tabId };
    if (frameId) {
      target.frameIds = [frameId];
    }
    const results = await chromeAPI_.scripting.executeScript({
      target,
      func,
      args,
    });
    return results[0].result as Result;
  }

  const code = codeStringForFunctionCall(func, args);
  const result = (await chromeAPI_.tabs.executeScript(tabId, {
    frameId,
    code,
  })) as Result[];
  return result[0];
}

export function getExtensionId(chromeAPI_ = chromeAPI) {
  return chromeAPI_.runtime.id;
}
