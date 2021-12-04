import { BrowserAction } from './browser-action';
import { chromeAPI } from './chrome-api';
import { directLinkQuery } from './direct-link-query';
import * as errors from './errors';
import { HelpPage } from './help-page';
import settings from './settings';
import { SidebarInjector } from './sidebar-injector';
import { TabState } from './tab-state';

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
  constructor() {
    const help = new HelpPage();
    const state = new TabState(onTabStateChange);
    const browserAction = new BrowserAction();
    const sidebar = new SidebarInjector();

    /** @type {Map<number, string>} */
    const currentlyLoadingUrl = new Map(); // keeps tracks of what URL each tab is loading

    /**
     * Opens the onboarding page.
     *
     * @param {chrome.management.ExtensionInfo} extensionInfo
     */
    this.firstRun = async extensionInfo => {
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
      state.activateTab(/** @type {number} */ (tab.id));
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
            const active = await sidebar.isClientActiveInTab(tab);
            return active;
          } catch (e) {
            console.warn(
              `Unable to determine extension state in tab ${tab.id}`,
              e
            );
            return false;
          }
        })
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

    /**
     * @param {number} tabId
     * @param {import('./tab-state').State | undefined} current
     */
    async function onTabStateChange(tabId, current) {
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

      updateTabDocument(tab);
    }

    // exposed for use by tests
    this._onTabStateChange = onTabStateChange;

    /** @param {chrome.tabs.Tab} tab */
    function onBrowserActionClicked(tab) {
      const tabId = /** @type {number} */ (tab.id);
      const tabError = state.getState(tabId).error;
      if (tabError) {
        help.showHelpForError(tab, tabError);
      } else if (state.isTabActive(tabId)) {
        state.deactivateTab(tabId);
      } else {
        state.activateTab(tabId);
      }
    }

    /**
     * Returns the active state for a tab
     * which has just been navigated to.
     *
     * @param {number} tabId
     */
    function activeStateForNavigatedTab(tabId) {
      let activeState = state.getState(tabId).state;
      if (activeState === 'errored') {
        // user had tried to activate H on the previous page but it failed,
        // retry on the new page
        activeState = 'active';
      }
      return activeState;
    }

    /**
     * @param {number} tabId
     * @param {string} url
     */
    function resetTabState(tabId, url) {
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
     *
     * @param {number} tabId
     * @param {chrome.tabs.TabChangeInfo} changeInfo
     * @param {chrome.tabs.Tab} tab
     */
    function onTabUpdated(tabId, { status }, tab) {
      // `url` property is included because manifest has the `tabs` permission
      const url = /** @type {string} */ (tab.url);
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
    }

    /**
     * @param {number} addedTabId
     * @param {number} removedTabId
     */
    async function onTabReplaced(addedTabId, removedTabId) {
      state.setState(addedTabId, {
        state: activeStateForNavigatedTab(removedTabId),
        ready: true,
      });
      state.clearTab(removedTabId);

      const tab = await chromeAPI.tabs.get(addedTabId);
      updateAnnotationCountIfEnabled(
        addedTabId,
        /** @type {string} */ (tab.url)
      );
    }

    /** @param {chrome.tabs.Tab} tab */
    function onTabCreated(tab) {
      // Clear the state in case there is old, conflicting data in storage.
      if (tab.id) {
        onTabRemoved(tab.id);
      }
    }

    /**
     *
     * @param {number} tabId
     */
    function onTabRemoved(tabId) {
      currentlyLoadingUrl.delete(tabId);
      state.clearTab(tabId);
    }

    /**
     * Installs or uninstalls the sidebar from a tab when the H
     * state for a tab changes
     *
     * @param {chrome.tabs.Tab} tab
     */
    function updateTabDocument(tab) {
      const tabId = /** @type {number} */ (tab.id);

      // If the tab has not yet finished loading then just quietly return.
      if (!state.getState(tabId).ready) {
        return;
      }

      const isInstalled = state.getState(tabId).extensionSidebarInstalled;
      if (state.isTabActive(tabId) && !isInstalled) {
        // optimistically set the state flag indicating that the sidebar
        // has been installed
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
        };

        // Pass the direct-link query as configuration into the client.
        //
        // The reason we don't rely on just putting this into the URL and letting
        // the client pick it up is to make direct-linking work in sites/apps
        // that modify the URL fragment as they load. See commit 3143ca27e05d.
        Object.assign(config, directLinkQuery);

        sidebar
          .injectIntoTab(tab, config)
          .then(function () {
            // Clear the direct link once H has been successfully injected
            state.setState(tabId, { directLinkQuery: undefined });
          })
          .catch(function (err) {
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
          });
      } else if (state.isTabInactive(tabId) && isInstalled) {
        sidebar.removeFromTab(tab).then(function () {
          state.setState(tabId, {
            extensionSidebarInstalled: false,
          });
        });
      }
    }

    /**
     * @param {number} tabId
     * @param {string} url
     */
    async function updateAnnotationCountIfEnabled(tabId, url) {
      // If user disabled the badge count, this call to `sync.get` will
      // return `{ badge: false}`
      const { badge } = await chromeAPI.storage.sync.get({
        badge: true, // the default value `true` is returned only if `badge` is not yet set.
      });
      if (badge) {
        state.updateAnnotationCount(tabId, url);
      }
    }
  }
}
