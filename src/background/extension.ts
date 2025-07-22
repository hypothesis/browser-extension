import { BrowserAction } from './browser-action';
import { chromeAPI } from './chrome-api';
import { directLinkQuery } from './direct-link-query';
import * as errors from './errors';
import { HelpPage } from './help-page';
import settings from './settings';
import { SidebarInjector } from './sidebar-injector';
import { TabState } from './tab-state';
import type { State } from './tab-state';

/** Options for {@link Extension.activate}. */
export type ActivateOptions = {
  /**
   * Defer activation of the extension until the tab navigates to this URL. This
   * is useful when the extension wants to handle a bouncer link by first
   * navigating the tab and then activating the extension.
   */
  afterNavigationTo?: string;
  /** Direct link query (eg. `#annotations:{id}`) to configure client to follow. */
  query?: string;
};

/**
 * Normalize a URL for comparison. This strips the fragment and converts
 * `http://` to `https://`.
 */
function normalizeURL(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Return true if two URLs are equal, ignoring the fragment and treating HTTP
 * and HTTPS as equivalent.
 */
function urlsEqual(urlA: string, urlB: string) {
  return normalizeURL(urlA) === normalizeURL(urlB);
}

/**
 * The main extension background application.
 *
 * This is responsible for tracking the state of the extension in each tab and
 * injecting of the client when the extension is activated by clicking the
 * extension's toolbar icon.
 *
 * Initializing the extension has two steps:
 *
 *  1. Create an instance of `Extension`
 *  2. Call the async {@link Extension.init} method to initialize the
 *     extension state for existing tabs.
 */
export class Extension {
  firstRun: (extensionInfo: chrome.management.ExtensionInfo) => Promise<void>;
  activate: (tabId: number, options: ActivateOptions) => void;
  init: () => Promise<void>;

  private _onTabStateChange: (
    tabId: number,
    current: State | undefined,
  ) => Promise<void>;

  constructor() {
    const help = new HelpPage();
    const state = new TabState(onTabStateChange);
    const browserAction = new BrowserAction();
    const sidebarInjector = new SidebarInjector();

    const currentlyLoadingUrl = new Map<number, string>(); // keeps tracks of what URL each tab is loading

    /**
     * Pending activations of extension. This is a map of tab ID to activation
     * URL and options. The activation is applied when the tab navigates to
     * the given URL.
     */
    const pendingActivations = new Map<number, ActivateOptions>();

    /**
     * Opens the onboarding page.
     */
    this.firstRun = async (extensionInfo: chrome.management.ExtensionInfo) => {
      // If we've been installed because of an administrative policy, then don't
      // open the welcome page in a new tab.
      //
      // It's safe to assume that if an admin policy is responsible for installing
      // the extension, opening the welcome page is going to do more harm than
      // good, as it will appear that a tab opened without user action.
      //
      // See:
      //
      //   https://developer.chrome.com/extensions/management#type-ExtensionInstallType
      //
      if (extensionInfo.installType === 'admin') {
        return;
      }

      const tab = await chromeAPI.tabs.create({
        url: settings.serviceUrl + 'welcome',
      });
      state.activateTab(tab.id!);
    };

    /**
     * Activate the extension on a specific tab.
     */
    this.activate = (tabId: number, options: ActivateOptions = {}) => {
      if (options.afterNavigationTo) {
        pendingActivations.set(tabId, options);
      } else {
        state.setState(tabId, {
          state: 'active',
          directLinkQuery: directLinkQuery(options.query ?? '') ?? undefined,
        });
      }
    };

    /**
     * Initialize cached state for browser tabs by querying each tab to see
     * whether the extension is active there.
     *
     * This should be called when the extension is loaded or reloaded.
     */
    const initTabStates = async () => {
      const tabs = await chromeAPI.tabs.query({});
      const activeStates = await Promise.all(
        tabs.map(async tab => {
          if (tab.id === undefined) {
            return false;
          }
          try {
            const active = await sidebarInjector.isClientActiveInTab(tab);
            return active;
          } catch (e) {
            console.warn(
              `Unable to determine extension state in tab ${tab.id}`,
              e,
            );
            return false;
          }
        }),
      );

      for (let i = 0; i < tabs.length; i++) {
        const tab = tabs[i];
        if (!tab.id) {
          continue;
        }
        const isActive = activeStates[i];

        // nb. If tab status is not available, we optimistically assume it is
        // loaded.
        const ready =
          tab.status === 'complete' || typeof tab.status !== 'string';

        state.setState(tab.id, {
          state: isActive ? 'active' : 'inactive',
          extensionSidebarInstalled: isActive,
          ready,
        });
      }
    };

    async function onTabStateChange(tabId: number, current: State | undefined) {
      if (!current) {
        return;
      }

      let tab;
      try {
        tab = await chromeAPI.tabs.get(tabId);
      } catch {
        state.clearTab(tabId);
        return;
      }

      browserAction.update(tabId, current);

      addOrRemoveClientFromTab(tab);
    }

    // exposed for use by tests
    this._onTabStateChange = onTabStateChange;

    async function onBrowserActionClicked(tab: chrome.tabs.Tab) {
      const tabId = tab.id!;
      const tabError = state.getState(tabId).error;
      if (tabError) {
        help.showHelpForError(tab, tabError);
      } else if (state.isTabActive(tabId)) {
        state.deactivateTab(tabId);
      } else {
        // Immediately request additional permissions we may need for this
        // specific tab, before any async calls. See notes in
        // `requestExtraPermissionsForTab` docs.
        //
        // eslint-disable-next-line no-lonely-if
        if (await sidebarInjector.requestExtraPermissionsForTab(tab)) {
          state.activateTab(tabId);
        } else {
          state.errorTab(
            tabId,
            new Error(
              'Hypothesis could not get the permissions needed to load in this tab',
            ),
          );
        }
      }
    }

    /**
     * Returns the active state for a tab which has just been navigated to.
     */
    function activeStateForNavigatedTab(tabId: number) {
      let activeState = state.getState(tabId).state;
      if (activeState === 'errored') {
        // user had tried to activate H on the previous page but it failed,
        // retry on the new page
        activeState = 'active';
      }
      return activeState;
    }

    function resetTabState(tabId: number, url: string) {
      state.setState(tabId, {
        state: activeStateForNavigatedTab(tabId),
        ready: false,
        annotationCount: 0,
        extensionSidebarInstalled: false,
      });
      updateAnnotationCountIfEnabled(tabId, url);
    }

    /**
     * This function will be called multiple times as the tab reloads.
     * https://developer.chrome.com/extensions/tabs#event-onUpdated
     *
     * 'changeInfo' contains details of what changed about the tab's status.
     * Two important events are when the tab's `status` changes to `loading`
     * when the user begins a new navigation and when the tab's status changes
     * to `complete` after the user completes a navigation
     */
    const onTabUpdated = (
      tabId: number,
      { status }: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab,
    ) => {
      // `url` property is included because manifest has the `tabs` permission
      const url = tab.url!;
      const loadingUrl = currentlyLoadingUrl.get(tabId);
      if (status === 'loading' && url !== loadingUrl) {
        currentlyLoadingUrl.set(tabId, url);
        resetTabState(tabId, url);
        const query = directLinkQuery(url);
        if (query) {
          state.setState(tabId, { directLinkQuery: query });
        }
      } else if (status === 'complete') {
        currentlyLoadingUrl.delete(tabId);
        const tabState = state.getState(tabId);
        let newActiveState = tabState.state;
        if (tabState.directLinkQuery) {
          newActiveState = 'active';
        }
        state.setState(tabId, {
          ready: true,
          state: newActiveState,
        });
      }

      // Apply activations scheduled for when tab navigates to its current URL.
      //
      // We compare normalized URLs because the browser may modify the fragment
      // or redirect HTTP to HTTPS, compared to the URL we expected the tab
      // to navigate to.
      const pendingActivation = pendingActivations.get(tabId);
      if (
        pendingActivation?.afterNavigationTo &&
        urlsEqual(pendingActivation.afterNavigationTo, url)
      ) {
        pendingActivations.delete(tabId);

        // Clear the URL so that the activation takes effect immediately.
        pendingActivation.afterNavigationTo = undefined;

        this.activate(tabId, pendingActivation);
      }
    };

    async function onTabReplaced(addedTabId: number, removedTabId: number) {
      state.setState(addedTabId, {
        state: activeStateForNavigatedTab(removedTabId),
        ready: true,
      });
      state.clearTab(removedTabId);

      const tab = await chromeAPI.tabs.get(addedTabId);
      if (tab?.url) {
        updateAnnotationCountIfEnabled(addedTabId, tab.url);
      }
    }

    function onTabCreated(tab: chrome.tabs.Tab) {
      // Clear the state in case there is old, conflicting data in storage.
      if (tab.id) {
        onTabRemoved(tab.id);
      }
    }

    function onTabRemoved(tabId: number) {
      currentlyLoadingUrl.delete(tabId);
      state.clearTab(tabId);
    }

    /**
     * Load or unload the Hypothesis client in a tab to match the corresponding
     * state in {@link state}.
     */
    async function addOrRemoveClientFromTab(tab: chrome.tabs.Tab) {
      const tabId = tab.id!;

      // If the tab has not yet finished loading then just quietly return.
      if (!state.getState(tabId).ready) {
        return;
      }

      const isInstalled = state.getState(tabId).extensionSidebarInstalled;
      if (state.isTabActive(tabId) && !isInstalled) {
        // Optimistically set the state flag indicating that the sidebar has
        // been installed.
        state.setState(tabId, {
          extensionSidebarInstalled: true,
        });

        const { directLinkQuery } = state.getState(tabId);

        // Configure client to load assets from extension.
        //
        // Note this configuration is duplicated in `pdfjs-init.js`. Any changes
        // made here must be reflected there as well.
        const config = {
          assetRoot: chromeAPI.runtime.getURL('/client/'),
          notebookAppUrl: chromeAPI.runtime.getURL('/client/notebook.html'),
          profileAppUrl: chromeAPI.runtime.getURL('/client/profile.html'),
          sidebarAppUrl: chromeAPI.runtime.getURL('/client/app.html'),

          // Pass the direct-link query as configuration into the client.
          //
          // The reason we don't rely on just putting this into the URL and letting
          // the client pick it up is to make direct-linking work in sites/apps
          // that modify the URL fragment as they load. See commit 3143ca27e05d.
          ...directLinkQuery,
        };

        try {
          await sidebarInjector.injectIntoTab(tab, config);

          // Clear the direct link once H has been successfully injected.
          state.setState(tabId, { directLinkQuery: undefined });
        } catch (err: any) {
          if (err instanceof errors.AlreadyInjectedError) {
            state.setState(tabId, {
              state: 'inactive',
              extensionSidebarInstalled: false,
            });
            return;
          }
          if (!errors.shouldIgnoreInjectionError(err)) {
            errors.report(err, 'Injecting Hypothesis sidebar', {
              url: tab.url,
            });
          }
          state.errorTab(tabId, err);
        }
      } else if (state.isTabInactive(tabId) && isInstalled) {
        await sidebarInjector.removeFromTab(tab);
        state.setState(tabId, {
          extensionSidebarInstalled: false,
        });
      }
    }

    async function updateAnnotationCountIfEnabled(tabId: number, url: string) {
      // If user disabled the badge count, this call to `sync.get` will
      // return `{ badge: false}`
      const { badge } = await chromeAPI.storage.sync.get({
        badge: true, // the default value `true` is returned only if `badge` is not yet set.
      });
      if (badge) {
        state.updateAnnotationCount(tabId, url);
      }
    }

    /**
     * Initialize the extension.
     *
     * This queries the state of the extension in existing tabs and sets up
     * event listeners to respond to future tab changes.
     *
     * If the extension's state in a particular tab cannot be determined,
     * the extension is assumed not to be loaded in that tab.
     *
     * @return - A promise that resolves once listeners have been set up and
     *   the state of existing tabs has been determined.
     */
    this.init = async () => {
      chromeAPI.browserAction.onClicked.addListener(onBrowserActionClicked);

      // Set up listeners for tab events.
      chromeAPI.tabs.onCreated.addListener(onTabCreated);

      // When a user navigates within an existing tab, onUpdated is fired in most cases
      chromeAPI.tabs.onUpdated.addListener(onTabUpdated);

      // ... but when a user navigates to a page that is loaded
      // via prerendering or instant results, onTabReplaced is
      // fired instead. See https://developer.chrome.com/extensions/tabs#event-onReplaced
      // and https://code.google.com/p/chromium/issues/detail?id=109557
      chromeAPI.tabs.onReplaced.addListener(onTabReplaced);

      chromeAPI.tabs.onRemoved.addListener(onTabRemoved);

      // Determine the state of the extension in existing tabs.
      await initTabStates();
    };
  }
}
