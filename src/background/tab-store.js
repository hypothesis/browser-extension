/** TabStore is used to persist the state of H browser tabs when
 * the extension is re-installed or updated.
 *
 * Note: This could also be used to persist the state across browser sessions,
 * for that to work however the storage key would need to be changed.
 * The tab ID is currently used but this is valid only for a browser session.
 */
export default function TabStore(storage) {
  const key = 'state';
  let local;

  this.get = function (tabId) {
    const value = local[tabId];
    if (!value) {
      throw new Error('TabStateStore could not find entry for tab: ' + tabId);
    }
    return value;
  };

  this.set = function (tabId, value) {
    // copy across only the parts of the tab state that should
    // be preserved
    local[tabId] = {
      state: value.state,
      annotationCount: value.annotationCount,
    };
    storage.setItem(key, JSON.stringify(local));
  };

  this.unset = function (tabId) {
    delete local[tabId];
    storage.setItem(key, JSON.stringify(local));
  };

  this.all = function () {
    return local;
  };

  this.reload = function () {
    try {
      local = {};
      const loaded = JSON.parse(storage.getItem(key));
      Object.keys(loaded).forEach(key => (local[key] = loaded[key]));
    } catch (e) {
      local = null;
    }
    local = local || {};
  };

  this.reload();
}
