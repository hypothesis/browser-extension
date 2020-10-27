import isShallowEqual from 'is-equal-shallow';

import * as uriInfo from './uri-info';

const states = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERRORED: 'errored',
};

/** The default H state for a new browser tab */
const DEFAULT_STATE = {
  /** Whether or not H is active on the page */
  state: states.INACTIVE,
  /** The count of annotations on the page visible to the user,
   * as returned by the badge API
   */
  annotationCount: 0,
  /** Whether or not the H sidebar has been installed onto the page by
   * the extension
   */
  extensionSidebarInstalled: false,
  /** Whether the tab is loaded and ready for the sidebar to be installed. */
  ready: false,
  /** The error for the current tab. */
  error: undefined,
};

/** TabState stores the H state for a tab. This state includes:
 *
 * - Whether the extension has been activated on a tab
 * - Whether the sidebar is currently installed on a tab
 * - The count of annotations visible to the user on the URL currently
 *   displayed in the tab.
 *
 * The H state for a tab is updated via the setState() method and
 * retrieved via getState().
 *
 * When the H state for a tab changes, the `onchange()` callback will
 * be triggered with the tab ID and current and previous states.
 *
 * initialState - An Object of tabId/state keys. Used when loading state
 *   from a persisted store such as localStorage. This will be merged with
 *   the default state for a tab.
 * onchange     - A function that recieves onchange(tabId, current).
 */
export default function TabState(initialState, onchange) {
  const self = this;
  let currentState;

  // This variable contains a map between the tabId and a object with a
  // cancellation function and the current waiting time.
  // The cancellation function is used to abort the badge request in a debounce fashion
  /** @type {Map<number, {cancel:function, waitMs: number}>} */
  const pendingAnnotationCountRequests = new Map();

  this.onchange = onchange || null;

  /** Replaces the H state for all tabs with the state data
   * from `newState`.
   *
   * @param newState - A dictionary mapping tab ID to tab state objects.
   *                   The provided state will be merged with the default
   *                   state for a tab.
   */
  this.load = function (newState) {
    const newCurrentState = {};
    Object.keys(newState).forEach(function (tabId) {
      newCurrentState[tabId] = Object.assign(
        {},
        DEFAULT_STATE,
        newState[tabId]
      );
    });
    currentState = newCurrentState;
  };

  this.activateTab = function (tabId) {
    this.setState(tabId, { state: states.ACTIVE });
  };

  this.deactivateTab = function (tabId) {
    this.setState(tabId, { state: states.INACTIVE });
  };

  this.errorTab = function (tabId, error) {
    this.setState(tabId, {
      state: states.ERRORED,
      error: error,
    });
  };

  this.clearTab = function (tabId) {
    this.setState(tabId, null);
    pendingAnnotationCountRequests.delete(tabId);
  };

  this.getState = function (tabId) {
    if (!currentState[tabId]) {
      return DEFAULT_STATE;
    }
    return currentState[tabId];
  };

  this.annotationCount = function (tabId) {
    return this.getState(tabId).annotationCount;
  };

  this.isTabActive = function (tabId) {
    return this.getState(tabId).state === states.ACTIVE;
  };

  this.isTabInactive = function (tabId) {
    return this.getState(tabId).state === states.INACTIVE;
  };

  this.isTabErrored = function (tabId) {
    return this.getState(tabId).state === states.ERRORED;
  };

  /**
   * Updates the H state for a tab.
   *
   * @param tabId - The ID of the tab being updated
   * @param stateUpdate - A dictionary of {key:value} properties for
   *                      state properties to update or null if the
   *                      state should be removed.
   */
  this.setState = function (tabId, stateUpdate) {
    let newState;
    if (stateUpdate) {
      newState = Object.assign({}, this.getState(tabId), stateUpdate);
      if (newState.state !== states.ERRORED) {
        newState.error = undefined;
      }
    }

    if (isShallowEqual(newState, currentState[tabId])) {
      return;
    }

    currentState[tabId] = newState;

    if (self.onchange) {
      self.onchange(tabId, newState);
    }
  };

  /**
   * Debouncing version of a badge request.
   * It debounces previous requests for the same tabId that are either
   * waiting or in-flight to be fulfilled.
   *
   * @param {()=>Promise<number>} request
   * @param {number} tabId
   * @return {Promise<number>}
   */
  function _debouncedRequest(request, tabId) {
    /**
     * It starts at INITIAL_WAIT_MS and it's doubled each time to a max defined
     * by MAX_WAIT_MS
     */
    const INITIAL_WAIT_MS = 1000;
    const MAX_WAIT_MS = 3000;
    return new Promise(resolve => {
      const pendingRequest = pendingAnnotationCountRequests.get(tabId);
      const wait = Math.min(
        pendingRequest?.waitMs ?? INITIAL_WAIT_MS,
        MAX_WAIT_MS
      );

      const timerId = setTimeout(async () => {
        resolve(await request());
      }, wait);

      // Cancel pending requests for the specific tabId, if any
      if (pendingRequest?.cancel) {
        pendingRequest.cancel();
      }

      // Add the cancellation function inmediately.
      // The cancellation function does two things:
      // 1. clears the timeout, and
      // 2. resolves the pending promise with default value 0.
      pendingAnnotationCountRequests.set(tabId, {
        cancel: () => {
          clearTimeout(timerId);
          resolve(0);
        },
        waitMs: wait * 2,
      });
    });
  }

  /**
   * Request the current annotation count for the tab's URL.
   *
   * @method
   * @param {integer} tabId The id of the tab.
   * @param {string} tabUrl The URL of the tab.
   * @return {Promise<void>}
   */
  this.updateAnnotationCount = async function (tabId, tabUrl) {
    const fetchCount = async () => {
      try {
        const annotationCount = await uriInfo.getAnnotationCount(tabUrl);
        return annotationCount;
      } catch (error) {
        /**
         * A variety of error conditions from `uriInfo.getAnnotationCount`
         * can be capture here.
         * Errors here can't be raised outside this catch, because
         * of the finally clause
         * A retry mechanism could be included here.
         */
        return 0;
      } finally {
        // Clear the pending request only at this point.
        // This point it's never reach by a cancellation.
        // Only reachable from a successful or unsucessful
        // badge request
        pendingAnnotationCountRequests.delete(tabId);
      }
    };

    const annotationCount = await _debouncedRequest(fetchCount, tabId);
    this.setState(tabId, { annotationCount });
  };

  this.load(initialState || {});
}

TabState.states = states;
