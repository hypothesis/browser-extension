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
  // In the test environment, the `chrome` global may not exist or may not
  // be the expected object.
  if (typeof chrome === 'undefined' || !chrome.extension) {
    // The `as never` causes this branch to be ignored when TS determines the
    // return type of this function.
    return null as never;
  }

  const browserAction = chrome.browserAction ?? chrome.action;

  return {
    browserAction: {
      onClicked: browserAction.onClicked,
      setBadgeBackgroundColor: browserAction.setBadgeBackgroundColor,
      setBadgeText: browserAction.setBadgeText,
      setIcon: browserAction.setIcon,
      setTitle: browserAction.setTitle,
    },

    extension: {
      isAllowedFileSchemeAccess: chrome.extension.isAllowedFileSchemeAccess,
    },

    management: {
      getSelf: chrome.management.getSelf,
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
        ? chrome.runtime.requestUpdateCheck
        : null,

      setUninstallURL: chrome.runtime.setUninstallURL,
    },

    permissions: {
      getAll: chrome.permissions.getAll,
      request: chrome.permissions.request,
    },

    tabs: {
      create: chrome.tabs.create,
      get: chrome.tabs.get,
      onCreated: chrome.tabs.onCreated,
      onReplaced: chrome.tabs.onReplaced,
      onRemoved: chrome.tabs.onRemoved,
      onUpdated: chrome.tabs.onUpdated,
      query: chrome.tabs.query,
      update: chrome.tabs.update,
    },

    scripting: {
      executeScript: chrome.scripting.executeScript,
    },

    storage: {
      // Methods of storage areas (sync, local, managed) need to be bound.
      // Standalone functions in Chrome API namespaces do not.
      sync: {
        get: chrome.storage.sync.get.bind(chrome.storage.sync),
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
        getAllFrames: chrome.webNavigation.getAllFrames,
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
// which abstract over differences between browsers and provide a simpler and
// more strongly typed interface.

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
  const target: chrome.scripting.InjectionTarget = frameId
    ? { tabId, frameIds: [frameId] }
    : { tabId };
  const results = await chromeAPI_.scripting.executeScript({
    target,
    files: [file],
  });
  return results[0].result;
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
  const target: chrome.scripting.InjectionTarget = frameId
    ? { tabId, frameIds: [frameId] }
    : { tabId };
  const results = await chromeAPI_.scripting.executeScript({
    target,
    func,
    args,
  });
  return results[0].result as Result;
}

export function getExtensionId(chromeAPI_ = chromeAPI) {
  return chromeAPI_.runtime.id;
}
