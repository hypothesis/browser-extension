import * as errors from '../../src/background/errors';
import HypothesisChromeExtension, {
  $imports,
} from '../../src/background/hypothesis-chrome-extension';
import { toResult } from '../promise-util';

// Creates a constructor function which takes no arguments
// and has a given prototype.
//
// Used to mock the extension modules
function createConstructor(prototype) {
  function Constructor() {}
  Constructor.prototype = Object.create(prototype);
  return Constructor;
}

function FakeListener() {
  this.addListener = function (callback) {
    this.listener = callback;
  };
}

/**
 * Return true if a tab state is valid
 *
 * @param {TabState} state
 */
function isValidState(state) {
  return ['active', 'inactive', 'errored'].includes(state.state);
}

describe('HypothesisChromeExtension', function () {
  let sandbox = sinon.createSandbox();
  let ext;
  let fakeChromeExtension;
  let fakeChromeStorage;
  let fakeChromeTabs;
  let fakeChromeBrowserAction;
  let fakeErrors;
  let fakeHelpPage;
  let fakeTabStore;
  let fakeTabState;
  let fakeBrowserAction;
  let fakeSidebarInjector;
  let chromeRuntime = { lastError: false };

  function createExt() {
    return new HypothesisChromeExtension({
      chromeExtension: fakeChromeExtension,
      chromeStorage: fakeChromeStorage,
      chromeTabs: fakeChromeTabs,
      chromeBrowserAction: fakeChromeBrowserAction,
      extensionURL: sandbox.stub(),
      isAllowedFileSchemeAccess: sandbox.stub().yields(true),
    });
  }

  beforeEach(function () {
    global.chrome = { runtime: chromeRuntime };
    fakeChromeStorage = {
      sync: {
        get: sandbox.stub().callsArgWith(1, { badge: true }),
      },
    };
    fakeChromeTabs = {
      onCreated: new FakeListener(),
      onUpdated: new FakeListener(),
      onReplaced: new FakeListener(),
      onRemoved: new FakeListener(),
      query: sandbox.spy(),
      get: sandbox.spy(),
    };
    fakeChromeBrowserAction = {
      onClicked: new FakeListener(),
    };
    fakeChromeExtension = {
      getURL: function (path) {
        return 'chrome://1234' + path;
      },
    };
    fakeHelpPage = {
      showHelpForError: sandbox.spy(),
    };
    fakeTabStore = {
      all: sandbox.spy(),
      set: sandbox.spy(),
      unset: sandbox.spy(),
      reload: sandbox.spy(),
    };
    fakeTabState = {
      activateTab: sandbox.spy(),
      deactivateTab: sandbox.spy(),
      errorTab: sandbox.spy(),
      previousState: sandbox.spy(),
      isTabActive: sandbox.stub().returns(false),
      isTabInactive: sandbox.stub().returns(false),
      isTabErrored: sandbox.stub().returns(false),
      getState: sandbox.stub().returns({}),
      setState: sandbox.spy(),
      clearTab: sandbox.spy(),
      load: sandbox.spy(),
      updateAnnotationCount: sandbox.spy(),
    };
    fakeTabState.deactivateTab = sinon.spy();
    fakeBrowserAction = {
      update: sandbox.spy(),
    };
    fakeSidebarInjector = {
      injectIntoTab: sandbox.stub().returns(Promise.resolve()),
      removeFromTab: sandbox.stub().returns(Promise.resolve()),
    };
    fakeErrors = {
      AlreadyInjectedError: function AlreadyInjectedError() {},
      shouldIgnoreInjectionError: function () {
        return false;
      },
      report: sandbox.spy(),
    };

    function FakeTabState(initialState, onchange) {
      fakeTabState.onChangeHandler = onchange;
    }
    FakeTabState.prototype = fakeTabState;

    $imports.$mock({
      './tab-state': { TabState: FakeTabState },
      './tab-store': { TabStore: createConstructor(fakeTabStore) },
      './help-page': { HelpPage: createConstructor(fakeHelpPage) },
      './browser-action': {
        BrowserAction: createConstructor(fakeBrowserAction),
      },
      './sidebar-injector': {
        SidebarInjector: createConstructor(fakeSidebarInjector),
      },
      './errors': fakeErrors,
      './settings': {
        default: {
          serviceUrl: 'https://hypothes.is/',
        },
      },
    });

    ext = createExt();
  });

  afterEach(function () {
    sandbox.restore();
    $imports.$restore();
    global.chrome = undefined;
  });

  describe('.install', function () {
    let tabs;
    let savedState;

    beforeEach(function () {
      tabs = [];
      savedState = {
        1: {
          state: 'active',
        },
      };
      tabs.push({ id: 1, url: 'http://example.com' });
      fakeChromeTabs.query = sandbox.stub().yields(tabs);
      fakeTabStore.all = sandbox.stub().returns(savedState);
    });

    it('restores the saved tab states', function () {
      ext.install();
      assert.called(fakeTabStore.reload);
      assert.calledWith(fakeTabState.load, savedState);
    });

    it('applies the saved state to open tabs', function () {
      fakeTabState.getState = sandbox.stub().returns(savedState[1]);
      fakeChromeTabs.get = sandbox.stub().yields({ id: 1 });
      ext.install();
      assert.calledWith(fakeBrowserAction.update, 1, savedState[1]);
    });
  });

  describe('.firstRun', function () {
    beforeEach(function () {
      fakeChromeTabs.create = sandbox.stub().yields({ id: 1 });
    });

    it('opens a new tab pointing to the welcome page', function () {
      ext.firstRun({});
      assert.called(fakeChromeTabs.create);
      assert.calledWith(fakeChromeTabs.create, {
        url: 'https://hypothes.is/welcome',
      });
    });

    it('sets the browser state to active', function () {
      ext.firstRun({});
      assert.called(fakeTabState.activateTab);
      assert.calledWith(fakeTabState.activateTab, 1);
    });

    it('does not open a new tab for administrative installs', function () {
      ext.firstRun({ installType: 'admin' });
      assert.notCalled(fakeChromeTabs.create);
      assert.notCalled(fakeTabState.activateTab);
    });
  });

  describe('.listen', function () {
    it('sets up event listeners', function () {
      ext.listen({ addEventListener: sandbox.stub() });
      assert.ok(fakeChromeBrowserAction.onClicked.listener);
      assert.ok(fakeChromeTabs.onCreated.listener);
      assert.ok(fakeChromeTabs.onUpdated.listener);
      assert.ok(fakeChromeTabs.onRemoved.listener);
      assert.ok(fakeChromeTabs.onReplaced.listener);
    });

    describe('when a tab is created', function () {
      beforeEach(function () {
        fakeTabState.clearTab = sandbox.spy();
        ext.listen({ addEventListener: sandbox.stub() });
      });

      it('clears the new tab state', function () {
        fakeChromeTabs.onCreated.listener({
          id: 1,
          url: 'http://example.com/foo.html',
        });
        assert.calledWith(fakeTabState.clearTab, 1);
      });
    });

    describe('when a tab is updated', function () {
      const tabState = {};
      function createTab(initialState) {
        const tabId = 1;
        tabState[tabId] = Object.assign(
          {
            state: 'inactive',
            annotationCount: 0,
            ready: false,
          },
          initialState
        );
        return {
          id: tabId,
          url: 'http://example.com/foo.html',
          status: 'complete',
        };
      }

      beforeEach(function () {
        fakeTabState.clearTab = sandbox.spy();
        fakeTabState.isTabActive = function (tabId) {
          return tabState[tabId].state === 'active';
        };
        fakeTabState.isTabErrored = function (tabId) {
          return tabState[tabId].state === 'errored';
        };
        fakeTabState.getState = function (tabId) {
          return tabState[tabId];
        };
        fakeTabState.setState = function (tabId, state) {
          tabState[tabId] = Object.assign(tabState[tabId], state);
          assert(isValidState(tabState[tabId]));
        };
        ext.listen({ addEventListener: sandbox.stub() });
      });

      it('sets the tab state to ready when loading completes', function () {
        const tab = createTab({ state: 'active' });
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'complete' }, tab);
        assert.equal(tabState[tab.id].ready, true);
      });

      it('resets the tab state when loading', function () {
        const tab = createTab({
          state: 'active',
          annotationCount: 8,
          ready: true,
          extensionSidebarInstalled: true,
        });
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);
      });

      it('ignores consecutive `loading` events for the same URL and tab until the loading is completed', function () {
        const tab = createTab({
          state: 'active',
          annotationCount: 8,
          ready: true,
          extensionSidebarInstalled: true,
        });
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);

        tabState[tab.id].annotationCount = 5;
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab); // ignored
        assert.equal(tabState[tab.id].annotationCount, 5);

        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'complete' }, tab);
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);
      });

      it('resets the tab state when loading a different URL (even when previous loading event did not complete)', function () {
        const tab = createTab({
          state: 'active',
          annotationCount: 8,
          ready: true,
          extensionSidebarInstalled: true,
        });
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);

        tabState[tab.id].annotationCount = 5;
        tab.url += '#new-fragment';
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab); // not ignored, because url changed
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);
      });

      it('resets the tab state to active if errored', function () {
        const tab = createTab({ state: 'errored' });
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        assert.equal(tabState[tab.id].state, 'active');
      });

      [
        '#annotations:456',
        '#annotations:query:blah',
        '#annotations:group:123',
      ].forEach(fragment => {
        it('injects the sidebar if a direct link is present', function () {
          const tab = createTab();
          tab.url += fragment;
          fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
          fakeChromeTabs.onUpdated.listener(
            tab.id,
            { status: 'complete' },
            tab
          );
          assert.equal(tabState[tab.id].state, 'active');
        });
      });

      it('injects the sidebar if the page rewrites the URL fragment', function () {
        const tab = createTab();
        const origURL = tab.url;
        tab.url += '#annotations:456';
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);

        // Simulate client side JS rewriting the URL fragment before the sidebar
        // is injected
        tab.url = origURL + '#modified-fragment';
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'complete' }, tab);
        assert.equal(tabState[tab.id].state, 'active');
      });

      it('updates the badge count', function () {
        const tab = createTab();
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'complete' }, tab);
        assert.calledWith(
          fakeTabState.updateAnnotationCount,
          tab.id,
          'http://example.com/foo.html'
        );
      });

      it('updates the badge count if "chrome.storage.sync" is not supported', function () {
        const tab = createTab();
        delete fakeChromeStorage.sync;

        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'complete' }, tab);

        assert.calledWith(
          fakeTabState.updateAnnotationCount,
          tab.id,
          'http://example.com/foo.html'
        );
      });

      it('does not update the badge count if the option is disabled', function () {
        const tab = createTab();
        fakeChromeStorage.sync.get.callsArgWith(1, { badge: false });

        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'loading' }, tab);
        fakeChromeTabs.onUpdated.listener(tab.id, { status: 'complete' }, tab);

        assert.notCalled(fakeTabState.updateAnnotationCount);
      });
    });

    describe('when a tab is replaced', function () {
      beforeEach(function () {
        ext.listen({ addEventListener: sandbox.stub() });
      });

      it('preserves the active state of the previous tab', function () {
        fakeTabState.getState = sandbox.stub().returns({
          state: 'active',
        });
        fakeChromeTabs.onReplaced.listener(1, 2);
        assert.calledWith(fakeTabState.clearTab, 2);
        assert.calledWith(fakeTabState.setState, 1, {
          state: 'active',
          ready: true,
        });
      });

      it('reactivates errored tabs', function () {
        fakeTabState.getState = sandbox.stub().returns({
          state: 'errored',
        });
        fakeChromeTabs.onReplaced.listener(1, 2);
        assert.calledWith(fakeTabState.setState, 1, {
          state: 'active',
          ready: true,
        });
      });
    });

    describe('when a tab is removed', function () {
      beforeEach(function () {
        fakeTabState.clearTab = sandbox.spy();
        ext.listen({ addEventListener: sandbox.stub() });
      });

      it('clears the tab', function () {
        fakeChromeTabs.onRemoved.listener(1);
        assert.calledWith(fakeTabState.clearTab, 1);
      });
    });

    describe('when the browser icon is clicked', function () {
      beforeEach(function () {
        ext.listen({ addEventListener: sandbox.stub() });
      });

      it('activate the tab if the tab is inactive', function () {
        fakeTabState.isTabInactive.returns(true);
        fakeChromeBrowserAction.onClicked.listener({
          id: 1,
          url: 'http://example.com/foo.html',
        });
        assert.called(fakeTabState.activateTab);
        assert.calledWith(fakeTabState.activateTab, 1);
      });

      it('deactivate the tab if the tab is active', function () {
        fakeTabState.isTabActive.returns(true);
        fakeChromeBrowserAction.onClicked.listener({
          id: 1,
          url: 'http://example.com/foo.html',
        });
        assert.called(fakeTabState.deactivateTab);
        assert.calledWith(fakeTabState.deactivateTab, 1);
      });
    });
  });

  describe('when injection fails', function () {
    function triggerInstall() {
      const tab = { id: 1, url: 'file://foo.html', status: 'complete' };
      const tabState = {
        state: 'active',
        extensionSidebarInstalled: false,
        ready: true,
      };
      fakeChromeTabs.get = function (tabId, callback) {
        callback(tab);
      };
      fakeTabState.isTabActive.withArgs(1).returns(true);
      fakeTabState.getState = sandbox.stub().returns(tabState);
      fakeTabState.onChangeHandler(tab.id, tabState, null);
    }

    beforeEach(function () {
      ext.listen({ addEventListener: sandbox.stub() });
    });

    const injectErrorCases = [
      errors.LocalFileError,
      errors.NoFileAccessError,
      errors.RestrictedProtocolError,
    ];

    injectErrorCases.forEach(function (ErrorType) {
      describe('with ' + ErrorType.name, function () {
        it('puts the tab into an errored state', function () {
          const injectError = Promise.reject(new ErrorType('msg'));
          fakeSidebarInjector.injectIntoTab.returns(injectError);

          triggerInstall();

          return toResult(injectError).then(function () {
            assert.called(fakeTabState.errorTab);
            assert.calledWith(fakeTabState.errorTab, 1);
          });
        });

        it('shows the help page for ' + ErrorType.name, function () {
          const tab = { id: 1, url: 'file://foo.html' };

          fakeTabState.getState.returns({
            state: 'errored',
            error: new ErrorType('msg'),
          });
          fakeTabState.isTabErrored.withArgs(1).returns(true);
          fakeChromeBrowserAction.onClicked.listener(tab);

          assert.called(fakeHelpPage.showHelpForError);
          assert.calledWith(
            fakeHelpPage.showHelpForError,
            tab,
            sinon.match.instanceOf(ErrorType)
          );
        });

        it('does not log known errors', function () {
          const error = new Error('Some error');
          fakeErrors.shouldIgnoreInjectionError = function () {
            return true;
          };
          const injectError = Promise.reject(error);
          fakeSidebarInjector.injectIntoTab.returns(injectError);

          triggerInstall();

          return toResult(injectError).then(function () {
            assert.notCalled(fakeErrors.report);
          });
        });

        it('logs unexpected errors', function () {
          const error = new ErrorType('msg');
          const injectError = Promise.reject(error);
          fakeSidebarInjector.injectIntoTab.returns(injectError);

          triggerInstall();

          return toResult(injectError).then(function () {
            assert.calledWith(
              fakeErrors.report,
              error,
              'Injecting Hypothesis sidebar',
              { url: 'file://foo.html' }
            );
          });
        });
      });
    });
  });

  describe('TabState.onchange', function () {
    let onChangeHandler;
    let tab;

    // simulate a tab state change from 'prev' to 'current'
    function onTabStateChange(current, prev) {
      onChangeHandler(
        1,
        current
          ? {
              state: current,
            }
          : null,
        prev
          ? {
              state: prev,
            }
          : null
      );
    }

    beforeEach(function () {
      tab = { id: 1, status: 'complete' };
      fakeChromeTabs.get = sandbox.stub().yields(tab);
      onChangeHandler = ext._onTabStateChange;
    });

    it('updates the browser icon', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
      });
      onTabStateChange('active', 'inactive');
      assert.calledWith(fakeBrowserAction.update, 1, {
        state: 'active',
      });
    });

    it('updates the TabStore if the tab has not errored', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
      });
      onTabStateChange('active', 'inactive');
      assert.calledWith(fakeTabStore.set, 1, {
        state: 'active',
      });
    });

    it('does not update the TabStore if the tab has errored', function () {
      fakeTabState.isTabErrored.returns(true);
      onTabStateChange('errored', 'inactive');
      assert.notCalled(fakeTabStore.set);
    });

    it('injects the sidebar if the tab has been activated', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        ready: true,
      });
      fakeTabState.isTabActive.returns(true);
      onTabStateChange('active', 'inactive');
      assert.calledWith(fakeSidebarInjector.injectIntoTab, tab);
    });

    it('configures the client to load assets from the extension', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        ready: true,
      });
      fakeTabState.isTabActive.returns(true);
      onTabStateChange('active', 'inactive');
      assert.calledWith(fakeSidebarInjector.injectIntoTab, tab, {
        assetRoot: 'chrome://1234/client/',
        notebookAppUrl: 'chrome://1234/client/notebook.html',
        sidebarAppUrl: 'chrome://1234/client/app.html',
      });
    });

    it('does not inject the sidebar if already installed', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        extensionSidebarInstalled: true,
        ready: true,
      });
      fakeTabState.isTabActive.returns(true);
      onTabStateChange('active', 'active');
      assert.notCalled(fakeSidebarInjector.injectIntoTab);
    });

    it('removes the sidebar if the tab has been deactivated', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'inactive',
        extensionSidebarInstalled: true,
        ready: true,
      });
      fakeTabState.isTabInactive.returns(true);
      fakeChromeTabs.get = sandbox.stub().yields({
        id: 1,
        status: 'complete',
      });
      onTabStateChange('inactive', 'active');
      assert.calledWith(fakeSidebarInjector.removeFromTab, tab);
    });

    it('does not remove the sidebar if not installed', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'inactive',
        extensionSidebarInstalled: false,
        ready: true,
      });
      fakeTabState.isTabInactive.returns(true);
      fakeChromeTabs.get = sandbox.stub().yields({ id: 1, status: 'complete' });
      onTabStateChange('inactive', 'active');
      assert.notCalled(fakeSidebarInjector.removeFromTab);
    });

    it('does nothing with the sidebar if the tab is errored', function () {
      fakeTabState.isTabErrored.returns(true);
      onTabStateChange('errored', 'inactive');
      assert.notCalled(fakeSidebarInjector.injectIntoTab);
      assert.notCalled(fakeSidebarInjector.removeFromTab);
    });

    it('does nothing if the tab is still loading', function () {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        extensionSidebarInstalled: false,
        ready: false,
      });
      onTabStateChange('active', 'inactive');
      assert.notCalled(fakeSidebarInjector.injectIntoTab);
    });

    it('clears the tab if there is a `chrome.runtime.lastError`', () => {
      chromeRuntime.lastError = true;
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        extensionSidebarInstalled: false,
        ready: false,
      });
      onTabStateChange('active', 'inactive');
      assert.called(fakeTabState.clearTab);
    });

    it('removes the tab from the store if the tab was closed', function () {
      onTabStateChange(null, 'inactive');
      assert.called(fakeTabStore.unset);
      assert.calledWith(fakeTabStore.unset);
    });
  });
});
