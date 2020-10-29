import isShallowEqual from 'is-equal-shallow';
import { RequestCanceledError } from './errors';

import * as uriInfo from './uri-info';

const states = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ERRORED: 'errored',
};

/** The default H state for a new browser tab */
const DEFAULT_STATE = {
  // Whether or not H is active on the page
  state: states.INACTIVE,
  // The count of annotations on the page visible to the user,
  // as returned by the badge API
  annotationCount: 0,
  // Whether or not the H sidebar has been installed onto the page by
  // the extension
  extensionSidebarInstalled: false,
  // Whether the tab is loaded and ready for the sidebar to be installed.
  ready: false,
  // The error for the current tab.
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
 * onchange     - A function that receives onchange(tabId, current).
 */
export default function TabState(initialState, onchange) {
  const self = this;
  let currentState;

  /**
   * @typedef BadgeRequest - this object is used to cancel a pending badge request
   * @prop {function} cancel - cancelation function to abort pending request
   * @prop {number} waitMs - the current waiting time after which the request will be invoked
   */

  // This variable contains a map between the tabId and current badge request.
  /** @type {Map<number, BadgeRequest>} */
  const pendingAnnotationCountRequests = new Map();

  // This variable contains a map between a URI and the associated annotation count.
  /** @type {Map<string, number>} */
  const annotationCountCache = new Map();

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
   * Request the current annotation count for the tab's URL.
   *
   * @method
   * @param {number} tabId The id of the tab.
   * @param {string} tabUrl The URL of the tab.
   * @return {Promise<void>}
   */
  this.updateAnnotationCount = async function (tabId, tabUrl) {
    const INITIAL_WAIT_MS = 1000;
    const MAX_WAIT_MS = 3000;
    const CACHE_EXPIRATION_MS = 3000;

    const pendingRequest = pendingAnnotationCountRequests.get(tabId);

    let url;
    try {
      url = uriInfo.uriForBadgeRequest(tabUrl);
    } catch {
      return;
    }

    const annotationCount = annotationCountCache.get(url);
    if (annotationCount !== undefined) {
      this.setState(tabId, { annotationCount });
      return;
    }

    const wait = Math.min(
      pendingRequest?.waitMs ?? INITIAL_WAIT_MS,
      MAX_WAIT_MS
    );

    pendingRequest?.cancel();

    const debouncedFetch = new Promise((resolve, reject) => {
      const timerId = setTimeout(async () => {
        let count = annotationCountCache.get(url);
        if (count !== undefined) {
          resolve(count);
          return;
        }

        try {
          count = await uriInfo.fetchAnnotationCount(url);
          annotationCountCache.set(url, count);
          setTimeout(
            () => annotationCountCache.delete(url),
            CACHE_EXPIRATION_MS
          );
        } catch {
          count = 0;
        }
        pendingAnnotationCountRequests.delete(tabId);
        resolve(count);
      }, wait);

      pendingAnnotationCountRequests.set(tabId, {
        cancel: () => {
          clearTimeout(timerId);
          reject(new RequestCanceledError('Badge request canceled'));
        },
        waitMs: wait * 2,
      });
    });

    try {
      const annotationCount = await debouncedFetch;
      this.setState(tabId, { annotationCount });
    } catch (error) {
      if (error instanceof RequestCanceledError) {
        // Do nothing
        return;
      }
      throw error;
    }
  };

  this.load(initialState || {});
}

TabState.states = states;
