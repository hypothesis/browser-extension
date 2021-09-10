/** @typedef {import('./tab-state').State} TabState */

/**
 * TabStore is used to persist the state of H browser tabs when
 * the extension is re-installed or updated.
 *
 * Note: This could also be used to persist the state across browser sessions,
 * for that to work however the storage key would need to be changed.
 * The tab ID is currently used but this is valid only for a browser session.
 *
 * @param {Storage} storage
 */
export function TabStore(storage) {
  const key = 'state';

  /** @type {Record<number, Partial<TabState>>} */
  let local;

  /** @param {number} tabId */
  this.get = function (tabId) {
    const value = local[tabId];
    if (!value) {
      throw new Error('TabStateStore could not find entry for tab: ' + tabId);
    }
    return value;
  };

  /**
   * @param {number} tabId
   * @param {TabState} value
   */
  this.set = function (tabId, value) {
    // copy across only the parts of the tab state that should
    // be preserved
    local[tabId] = {
      state: value.state,
      annotationCount: value.annotationCount,
    };
    storage.setItem(key, JSON.stringify(local));
  };

  /** @param {number} tabId */
  this.unset = function (tabId) {
    delete local[tabId];
    storage.setItem(key, JSON.stringify(local));
  };

  this.all = function () {
    return local;
  };

  /** @param {number[]} tabIds */
  this.reload = tabIds => {
    try {
      local = {};
      const jsonStr = storage.getItem(key);
      if (!jsonStr) {
        return;
      }
      const loaded = JSON.parse(jsonStr);
      tabIds.forEach(tabId => {
        const state = loaded[tabId];
        if (state) {
          local[tabId] = state;
        }
      });
    } catch {
      local = {};
    }
  };
}
