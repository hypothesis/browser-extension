// @ts-ignore
import isShallowEqual from 'is-equal-shallow';

import { RequestCanceledError } from './errors';

import * as uriInfo from './uri-info';

/**
 * @typedef {import('./direct-link-query').Query} Query
 */

/**
 * Hypothesis-related state for a specific tab.
 *
 * This should really be named `TabState` but that will conflict with the
 * `TabState` class below. That class needs to be renamed first.
 *
 * @typedef State
 * @prop {'active'|'inactive'|'errored'} state - Whether the user has activated
 *   Hypothesis for this tab. This state persists across page navigations,
 *   whereas `extensionSidebarInstalled` will be reset after a navigation,
 *   until the document has been loaded and the client is re-injected.
 * @prop {number} annotationCount -
 *   The count of annotations on the page visible to the user, as returned by
 *   the badge API
 * @prop {boolean} extensionSidebarInstalled - Has the client been loaded into this tab?
 * @prop {boolean} ready - Is the tab loaded and ready for the client to be loaded?
 * @prop {Error} [error]
 * @prop {Query} [directLinkQuery]
 */

/**
 * The default H state for a new browser tab.
 *
 * @type {State}
 */
const DEFAULT_STATE = {
  state: 'inactive',
  annotationCount: 0,
  extensionSidebarInstalled: false,
  ready: false,
  error: undefined,
};

/**
 * @typedef {{ [tabId: number]: State }} TabStateMap
 */

/**
 * TabState stores the Hypothesis-related state for tabs in the current browser
 * session.
 *
 * @param {(tabId: number, current: undefined|State) => any} onchange -
 *   Callback invoked when state for a tab changes
 */
export function TabState(onchange) {
  /**
   * Current Hypothesis-related state for each tab.
   *
   * @type {TabStateMap}
   */
  let currentState = {};

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

  this.onchange = onchange;

  /**
   * Mark a tab as having Hypothesis loaded in it.
   *
   * @param {number} tabId
   */
  this.activateTab = function (tabId) {
    this.setState(tabId, { state: 'active' });
  };

  /**
   * Mark a tab as not having Hypothesis loaded.
   *
   * @param {number} tabId
   */
  this.deactivateTab = function (tabId) {
    this.setState(tabId, { state: 'inactive' });
  };

  /**
   * Mark a tab as having encountered an error when trying to load Hypothesis into it.
   *
   * @param {number} tabId
   * @param {Error} error
   */
  this.errorTab = function (tabId, error) {
    this.setState(tabId, {
      state: 'errored',
      error: error,
    });
  };

  /**
   * Remove Hypothesis-related state about a given tab.
   *
   * @param {number} tabId
   */
  this.clearTab = function (tabId) {
    this.setState(tabId, null);
    pendingAnnotationCountRequests.delete(tabId);
  };

  /**
   * Return the current Hypothesis-related state for a tab.
   *
   * @param {number} tabId
   * @return {State}
   */
  this.getState = function (tabId) {
    if (!currentState[tabId]) {
      return DEFAULT_STATE;
    }
    return currentState[tabId];
  };

  /**
   * Return the badge count for a given tab.
   *
   * @param {number} tabId
   */
  this.annotationCount = function (tabId) {
    return this.getState(tabId).annotationCount;
  };

  /**
   * Return `true` if Hypothesis is loaded into a given tab.
   *
   * @param {number} tabId
   */
  this.isTabActive = function (tabId) {
    return this.getState(tabId).state === 'active';
  };

  /**
   * Return `true` if Hypothesis is not loaded in a given tab.
   *
   * @param {number} tabId
   */
  this.isTabInactive = function (tabId) {
    return this.getState(tabId).state === 'inactive';
  };

  /**
   * Return `true` if an error occurred while trying to load Hypothesis into a given tab.
   *
   * @param {number} tabId
   */
  this.isTabErrored = function (tabId) {
    return this.getState(tabId).state === 'errored';
  };

  /**
   * Updates the H state for a tab.
   *
   * @param {number} tabId - The ID of the tab being updated
   * @param {Partial<State>|null} stateUpdate
   */
  this.setState = function (tabId, stateUpdate) {
    /** @type {State|undefined} */
    let newState;
    if (stateUpdate) {
      newState = Object.assign({}, this.getState(tabId), stateUpdate);
      if (newState.state !== 'errored') {
        newState.error = undefined;
      }
    }

    if (isShallowEqual(newState, currentState[tabId])) {
      return;
    }

    if (newState) {
      currentState[tabId] = newState;
    } else {
      delete currentState[tabId];
    }

    if (this.onchange) {
      this.onchange(tabId, newState);
    }
  };

  /**
   * Request the current annotation count for the tab's URL.
   *
   * @param {number} tabId The id of the tab.
   * @param {string} tabUrl The URL of the tab.
   * @return {Promise<void>}
   */
  this.updateAnnotationCount = async function (tabId, tabUrl) {
    const INITIAL_WAIT_MS = 1000;
    const MAX_WAIT_MS = 3000;
    const CACHE_EXPIRATION_MS = 3000;

    const pendingRequest = pendingAnnotationCountRequests.get(tabId);

    /** @type {string} */
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
}
