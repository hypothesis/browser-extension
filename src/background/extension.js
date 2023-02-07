import { BrowserAction } from './browser-action';
import { chromeAPI } from './chrome-api';
import { directLinkQuery } from './direct-link-query';
import * as errors from './errors';
import { HelpPage } from './help-page';
import settings from './settings';
import { SidebarInjector } from './sidebar-injector';
import { TabState } from './tab-state';
import { TabStore } from './tab-store';

/**
 * The main extension application. This wires together all the smaller
 * modules. The app listens to all new created/updated/removed tab events
 * and uses the TabState object to keep track of whether the sidebar is
 * active or inactive in the tab. The app also listens to click events on
 * the browser action and toggles the state and uses the BrowserAction module
 * to update the visual style of the button.
 *
 * The SidebarInjector handles the insertion of the Hypothesis code. If it
 * runs into errors the tab is put into an errored state and when the
 * browser action is clicked again the HelpPage module displays more
 * information to the user.
 *
 * Lastly the TabStore listens to changes to the TabState module and persists
 * the current settings to localStorage. This is then loaded into the
 * application on startup.
 */
export class Extension {
  constructor() {
    const help = new HelpPage();
    const store = new TabStore(localStorage);
    const state = new TabState(store.all(), onTabStateChange);
    const browserAction = new BrowserAction();
    const sidebar = new SidebarInjector();

    /** @type {Map<number, string>} */
    const currentlyLoadingUrl = new Map(); // keeps tracks of what URL each tab is loading

    restoreSavedTabState();

    /**
     * Sets up the extension and binds event listeners. Requires a window
     * object to be passed so that it can listen for localStorage events.
     */
    this.listen = function () {
      chromeAPI.browserAction.onClicked.addListener(onBrowserActionClicked);
      chromeAPI.tabs.onCreated.addListener(onTabCreated);

      // when a user navigates within an existing tab,
      // onUpdated is fired in most cases
      chromeAPI.tabs.onUpdated.addListener(onTabUpdated);

      // ... but when a user navigates to a page that is loaded
      // via prerendering or instant results, onTabReplaced is
      // fired instead. See https://developer.chrome.com/extensions/tabs#event-onReplaced
      // and https://code.google.com/p/chromium/issues/detail?id=109557
      chromeAPI.tabs.onReplaced.addListener(onTabReplaced);

      chromeAPI.tabs.onRemoved.addListener(onTabRemoved);
    };

    /**
     * A method that can be used to setup the extension on existing tabs
     * when the extension is re-installed.
     */
    this.install = async () => {
      await restoreSavedTabState();
    };

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

    async function restoreSavedTabState() {
      const tabs = await chromeAPI.tabs.query({});
      const tabIds = tabs
        .filter(tab => tab.id !== undefined)
        .map(({ id }) => /** @type {number} */ (id));
      store.reload(tabIds);
      state.load(store.all());
      tabIds.forEach(tabId => {
        onTabStateChange(tabId, state.getState(tabId));
      });
    }

    /**
     * @param {number} tabId
     * @param {import('./tab-state').State | undefined} current
     */
    async function onTabStateChange(tabId, current) {
      if (current) {
        let tab;
        try {
          tab = await chromeAPI.tabs.get(tabId);
        } catch {
          state.clearTab(tabId);
          return;
        }

        browserAction.update(tabId, current);

        updateTabDocument(tab);

        if (!state.isTabErrored(tabId)) {
          store.set(tabId, current);
        }
      } else {
        store.unset(tabId);
      }
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

        const config = {
          // Configure client to load assets and sidebar app from extension.
          // Note: Even though the sidebar app URL is correct here and the page
          // does load, Chrome devtools may incorrectly report that it failed to
          // load. See https://bugs.chromium.org/p/chromium/issues/detail?id=667533
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
