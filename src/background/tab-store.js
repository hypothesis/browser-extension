/** TabStore is used to persist the state of H browser tabs when
 * the extension is re-installed or updated.
 *
 * Note: This could also be used to persist the state across browser sessions,
 * for that to work however the storage key would need to be changed.
 * The tab ID is currently used but this is valid only for a browser session.
 */

export default class TabStore {
  static key = 'state';

  /** @param {Storage} storage */
  constructor(storage) {
    /** @type{Record<number, any>} */
    this.local = {};
    this.storage = storage;
    this.reload();
  }

  /** @param {number} tabId */
  get(tabId) {
    const value = this.local[tabId];
    if (!value) {
      throw new Error('TabStateStore could not find entry for tab: ' + tabId);
    }
  }

  /**
   * @param {number} tabId
   * @param {any} value
   */
  set(tabId, value) {
    // copy across only the parts of the tab state that should
    // be preserved
    this.local[tabId] = {
      state: value.state,
      annotationCount: value.annotationCount,
    };
    this.storage.setItem(TabStore.key, JSON.stringify(this.local));
  }

  /** @param {number} tabId */
  unset(tabId) {
    delete this.local[tabId];
    this.storage.setItem(TabStore.key, JSON.stringify(this.local));
  }

  all() {
    return this.local;
  }

  reload() {
    try {
      this.local = {};
      const loaded = JSON.parse(this.storage.getItem(TabStore.key) || '{}');
      Object.keys(loaded).forEach(key => {
        // ignore tab state saved by earlier versions of
        // the extension which saved the state as a {key: <state string>}
        // dict rather than {key: <state object>}
        if (typeof loaded[key] === 'string') {
          this.local[key] = { state: loaded[key] };
        } else {
          this.local[key] = loaded[key];
        }
      });
    } catch {
      this.local = {};
    }
  }
}
