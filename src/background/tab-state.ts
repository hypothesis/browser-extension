// @ts-expect-error
import isShallowEqual from 'is-equal-shallow';

import type { Query } from './direct-link-query';
import { RequestCanceledError } from './errors';
import * as uriInfo from './uri-info';

/**
 * Hypothesis-related state for a specific tab.
 *
 * This should really be named `TabState` but that will conflict with the
 * `TabState` class below. That class needs to be renamed first.
 */
export type State = {
  /**
   * Whether the user has activated Hypothesis for this tab. This state
   * persists across page navigations, whereas `extensionSidebarInstalled` will
   * be reset after a navigation, until the document has been loaded and the
   * client is re-injected.
   */
  state: 'active' | 'inactive' | 'errored';

  /**
   * The count of annotations on the page visible to the user, as returned by
   * the badge API
   */
  annotationCount: number;

  /** Has the client been loaded into this tab? */
  extensionSidebarInstalled: boolean;

  /** Is the tab loaded and ready for the client to be loaded? */
  ready: boolean;

  /** Details of error that occurred while trying to activate Hypothesis in this tab. */
  error?: Error;

  /**
   * Query indicating the annotation, group etc. to focus when Hypothesis loads
   * in this tab.
   */
  directLinkQuery?: Query;
};

/**
 * The default H state for a new browser tab.
 */
const DEFAULT_STATE: State = {
  state: 'active',
  annotationCount: 0,
  extensionSidebarInstalled: false,
  ready: false,
  error: undefined,
};

/**
 * Represents a pending request to the `/api/badge` endpoint to get the
 * annotation count for a URI.
 */
type BadgeRequest = {
  /** Abort the request. */
  cancel: () => void;
  /** Delay before the request is performed. */
  waitMs: number;
};

/**
 * TabState stores the Hypothesis-related state for tabs in the current browser
 * session.
 */
export class TabState {
  /** Map of URI to annotation count. */
  private _annotationCountCache: Map<string, number>;

  /** Map of tab ID to current badge request. */
  private _pendingAnnotationCountRequests: Map<number, BadgeRequest>;

  private _currentState: Map<number, State>;

  /** Callback invoked when a tab's state changes. */
  onchange: (tabId: number, current: State | undefined) => void;

  /**
   * Current Hypothesis-related state for each tab.
   *
   * @param onchange - Callback invoked when state for a tab changes
   */
  constructor(onchange: (tabid: number, current: State | undefined) => void) {
    this._currentState = new Map();
    this._pendingAnnotationCountRequests = new Map();
    this._annotationCountCache = new Map();
    this.onchange = onchange;
  }

  /**
   * Mark a tab as having Hypothesis loaded in it.
   */
  activateTab(tabId: number) {
    this.setState(tabId, { state: 'active' });
  }

  /**
   * Mark a tab as not having Hypothesis loaded.
   */
  deactivateTab(tabId: number) {
    this.setState(tabId, { state: 'inactive' });
  }

  /**
   * Mark a tab as having encountered an error when trying to load Hypothesis into it.
   */
  errorTab(tabId: number, error: Error) {
    this.setState(tabId, {
      state: 'errored',
      error,
    });
  }

  /**
   * Remove Hypothesis-related state about a given tab.
   */
  clearTab(tabId: number) {
    this.setState(tabId, null);
    this._pendingAnnotationCountRequests.delete(tabId);
  }

  /**
   * Return the current Hypothesis-related state for a tab.
   */
  getState(tabId: number): State {
    return this._currentState.get(tabId) ?? DEFAULT_STATE;
  }

  /**
   * Return the badge count for a given tab.
   */
  annotationCount(tabId: number) {
    return this.getState(tabId).annotationCount;
  }

  /**
   * Return `true` if Hypothesis is loaded into a given tab.
   */
  isTabActive(tabId: number) {
    return this.getState(tabId).state === 'active';
  }

  /**
   * Return `true` if Hypothesis is not loaded in a given tab.
   */
  isTabInactive(tabId: number) {
    return this.getState(tabId).state === 'inactive';
  }

  /**
   * Return `true` if an error occurred while trying to load Hypothesis into a given tab.
   */
  isTabErrored(tabId: number) {
    return this.getState(tabId).state === 'errored';
  }

  /**
   * Updates the H state for a tab.
   *
   * @param tabId - The ID of the tab being updated
   */
  setState(tabId: number, stateUpdate: Partial<State> | null) {
    let newState: State | undefined;
    if (stateUpdate) {
      newState = Object.assign({}, this.getState(tabId), stateUpdate);
      if (newState.state !== 'errored') {
        newState.error = undefined;
      }
    }

    if (isShallowEqual(newState, this._currentState.get(tabId))) {
      return;
    }

    if (newState) {
      this._currentState.set(tabId, newState);
    } else {
      this._currentState.delete(tabId);
    }

    if (this.onchange) {
      this.onchange(tabId, newState);
    }
  }

  /**
   * Request the current annotation count for the tab's URL.
   *
   * @param tabId The id of the tab.
   * @param tabUrl The URL of the tab.
   */
  async updateAnnotationCount(tabId: number, tabUrl: string) {
    const INITIAL_WAIT_MS = 1000;
    const MAX_WAIT_MS = 3000;
    const CACHE_EXPIRATION_MS = 3000;

    const pendingRequest = this._pendingAnnotationCountRequests.get(tabId);

    let url: string;
    try {
      url = uriInfo.uriForBadgeRequest(tabUrl);
    } catch {
      return;
    }

    const annotationCount = this._annotationCountCache.get(url);
    if (annotationCount !== undefined) {
      this.setState(tabId, { annotationCount });
      return;
    }

    const wait = Math.min(
      pendingRequest?.waitMs ?? INITIAL_WAIT_MS,
      MAX_WAIT_MS,
    );

    pendingRequest?.cancel();

    const debouncedFetch = new Promise<number>((resolve, reject) => {
      const timerId = setTimeout(async () => {
        let count = this._annotationCountCache.get(url);
        if (count !== undefined) {
          resolve(count);
          return;
        }

        try {
          count = await uriInfo.fetchAnnotationCount(url);
          this._annotationCountCache.set(url, count);
          setTimeout(
            () => this._annotationCountCache.delete(url),
            CACHE_EXPIRATION_MS,
          );
        } catch {
          count = 0;
        }
        this._pendingAnnotationCountRequests.delete(tabId);
        resolve(count);
      }, wait);

      this._pendingAnnotationCountRequests.set(tabId, {
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
  }
}
