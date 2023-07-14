import * as errors from '../../src/background/errors';
import { Extension, $imports } from '../../src/background/extension';
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Extension', () => {
  let sandbox = sinon.createSandbox();
  let ext;
  let fakeChromeAPI;
  let fakeErrors;
  let fakeHelpPage;
  let fakeTabState;
  let fakeBrowserAction;
  let fakeSidebarInjector;

  beforeEach(() => {
    fakeChromeAPI = {
      storage: {
        sync: {
          get: sandbox.stub().resolves({ badge: true }),
        },
      },
      tabs: {
        onCreated: new FakeListener(),
        onUpdated: new FakeListener(),
        onReplaced: new FakeListener(),
        onRemoved: new FakeListener(),
        query: sandbox.stub().resolves([]),
        get: sandbox.stub(),
      },

      browserAction: {
        onClicked: new FakeListener(),
      },

      runtime: {
        getURL: function (path) {
          return 'chrome://1234' + path;
        },
      },
    };

    fakeHelpPage = {
      showHelpForError: sandbox.spy(),
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
      isClientActiveInTab: sandbox.stub().resolves(false),
      injectIntoTab: sandbox.stub().resolves(),
      removeFromTab: sandbox.stub().resolves(),
      requestExtraPermissionsForTab: sandbox.stub().resolves(true),
    };
    fakeErrors = {
      AlreadyInjectedError: function AlreadyInjectedError() {},
      shouldIgnoreInjectionError: function () {
        return false;
      },
      report: sandbox.spy(),
    };

    function FakeTabState(onchange) {
      fakeTabState.onChangeHandler = onchange;
    }
    FakeTabState.prototype = fakeTabState;

    $imports.$mock({
      './chrome-api': { chromeAPI: fakeChromeAPI },
      './tab-state': { TabState: FakeTabState },
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

    ext = new Extension();
  });

  afterEach(() => {
    sandbox.restore();
    $imports.$restore();
  });

  describe('#firstRun', () => {
    beforeEach(() => {
      fakeChromeAPI.tabs.create = sandbox.stub().resolves({ id: 1 });
    });

    it('opens a new tab pointing to the welcome page', async () => {
      await ext.firstRun({});
      assert.called(fakeChromeAPI.tabs.create);
      assert.calledWith(fakeChromeAPI.tabs.create, {
        url: 'https://hypothes.is/welcome',
      });
    });

    it('sets the browser state to active', async () => {
      await ext.firstRun({});
      assert.called(fakeTabState.activateTab);
      assert.calledWith(fakeTabState.activateTab, 1);
    });

    it('does not open a new tab for administrative installs', async () => {
      await ext.firstRun({ installType: 'admin' });
      assert.notCalled(fakeChromeAPI.tabs.create);
      assert.notCalled(fakeTabState.activateTab);
    });
  });

  describe('#activate', () => {
    beforeEach(async () => {
      await ext.init();
    });

    it('activates extension immediately if `afterNavigationTo` is not set', () => {
      ext.activate(1, {
        query: '#annotations:1234',
      });
      assert.calledWith(fakeTabState.setState, 1, {
        state: 'active',
        directLinkQuery: { annotations: '1234' },
      });
    });

    it('activates extension after navigation if `afterNavigationTo` is set', () => {
      ext.activate(1, {
        afterNavigationTo: 'https://newsite.com/',
        query: '#annotations:1234',
      });
      assert.notCalled(fakeTabState.setState);

      fakeChromeAPI.tabs.onUpdated.listener(
        1,
        { status: 'loading' },
        { url: 'https://newsite.com/' },
      );

      assert.calledWith(fakeTabState.setState, 1, {
        state: 'active',
        directLinkQuery: { annotations: '1234' },
      });
    });

    [
      // HTTP vs HTTPS is ignored. This is important as a bouncer link might
      // point to an HTTP URL, but the browser may auto-redirect to HTTPS.
      {
        afterNavigationTo: 'http://example.com/',
        tabURL: 'https://example.com/',
      },

      // Fragments are ignored in URL comparison.
      {
        afterNavigationTo: 'https://example.com/',
        tabURL: 'https://example.com/#some-fragment',
      },
    ].forEach(({ tabURL, afterNavigationTo }) => {
      it('ignores some differences when comparing tab URL and `afterNavigationTo` URL', () => {
        ext.activate(1, {
          afterNavigationTo,
          query: '#annotations:1234',
        });

        fakeChromeAPI.tabs.onUpdated.listener(
          1,
          { status: 'loading' },
          { url: tabURL },
        );

        assert.calledWith(fakeTabState.setState, 1, {
          state: 'active',
          directLinkQuery: { annotations: '1234' },
        });
      });
    });
  });

  describe('#init', () => {
    afterEach(() => {
      console.warn.restore?.();
    });

    it('sets up event listeners', async () => {
      await ext.init();
      assert.ok(fakeChromeAPI.browserAction.onClicked.listener);
      assert.ok(fakeChromeAPI.tabs.onCreated.listener);
      assert.ok(fakeChromeAPI.tabs.onUpdated.listener);
      assert.ok(fakeChromeAPI.tabs.onRemoved.listener);
      assert.ok(fakeChromeAPI.tabs.onReplaced.listener);
    });

    it('initializes state for existing tabs', async () => {
      fakeChromeAPI.tabs.query.resolves([
        { id: 1, url: 'https://foo.com', status: 'complete' },
        { id: 2, url: 'https://bar.com', status: 'complete' },
        { id: 3, url: 'https://baz.com', status: 'loading' },
      ]);
      fakeSidebarInjector.isClientActiveInTab
        .withArgs(sinon.match({ id: 1 }))
        .resolves(false);
      fakeSidebarInjector.isClientActiveInTab
        .withArgs(sinon.match({ id: 2 }))
        .resolves(true);
      fakeSidebarInjector.isClientActiveInTab
        .withArgs(sinon.match({ id: 3 }))
        .resolves(true);

      await ext.init();

      assert.calledWith(fakeTabState.setState, 1, {
        state: 'inactive',
        extensionSidebarInstalled: false,
        ready: true,
      });
      assert.calledWith(fakeTabState.setState, 2, {
        state: 'active',
        extensionSidebarInstalled: true,
        ready: true,
      });
      assert.calledWith(fakeTabState.setState, 3, {
        state: 'active',
        extensionSidebarInstalled: true,
        ready: false,
      });
    });

    it('assumes extension is not activated if querying state fails', async () => {
      const warn = sinon.stub(console, 'warn');

      fakeChromeAPI.tabs.query.resolves([
        { id: 1, url: 'https://foo.com', status: 'complete' },
      ]);
      fakeSidebarInjector.isClientActiveInTab
        .withArgs(sinon.match({ id: 1 }))
        .rejects(new Error('Something went wrong'));

      await ext.init();

      assert.calledWith(
        warn,
        sinon.match(/Unable to determine extension state in tab 1/),
      );
      assert.calledWith(fakeTabState.setState, 1, {
        state: 'inactive',
        extensionSidebarInstalled: false,
        ready: true,
      });
    });

    describe('when a tab is created', () => {
      beforeEach(async () => {
        fakeTabState.clearTab = sandbox.spy();
        await ext.init();
      });

      it('clears the new tab state', () => {
        fakeChromeAPI.tabs.onCreated.listener({
          id: 1,
          url: 'http://example.com/foo.html',
        });
        assert.calledWith(fakeTabState.clearTab, 1);
      });
    });

    describe('when a tab is updated', () => {
      const tabState = {};
      function createTab(initialState) {
        const tabId = 1;
        tabState[tabId] = Object.assign(
          {
            state: 'inactive',
            annotationCount: 0,
            ready: false,
          },
          initialState,
        );
        return {
          id: tabId,
          url: 'http://example.com/foo.html',
          status: 'complete',
        };
      }

      beforeEach(async () => {
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
        await ext.init();
      });

      it('sets the tab state to ready when loading completes', () => {
        const tab = createTab({ state: 'active' });
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'complete' },
          tab,
        );
        assert.equal(tabState[tab.id].ready, true);
      });

      it('resets the tab state when loading', () => {
        const tab = createTab({
          state: 'active',
          annotationCount: 8,
          ready: true,
          extensionSidebarInstalled: true,
        });
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);
      });

      it('ignores consecutive `loading` events for the same URL and tab until the loading is completed', () => {
        const tab = createTab({
          state: 'active',
          annotationCount: 8,
          ready: true,
          extensionSidebarInstalled: true,
        });
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);

        tabState[tab.id].annotationCount = 5;
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        ); // ignored
        assert.equal(tabState[tab.id].annotationCount, 5);

        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'complete' },
          tab,
        );
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);
      });

      it('resets the tab state when loading a different URL (even when previous loading event did not complete)', () => {
        const tab = createTab({
          state: 'active',
          annotationCount: 8,
          ready: true,
          extensionSidebarInstalled: true,
        });
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);

        tabState[tab.id].annotationCount = 5;
        tab.url += '#new-fragment';
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        ); // not ignored, because url changed
        assert.equal(tabState[tab.id].ready, false);
        assert.equal(tabState[tab.id].annotationCount, 0);
        assert.equal(tabState[tab.id].extensionSidebarInstalled, false);
      });

      it('resets the tab state to active if errored', () => {
        const tab = createTab({ state: 'errored' });
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        assert.equal(tabState[tab.id].state, 'active');
      });

      [
        '#annotations:456',
        '#annotations:query:blah',
        '#annotations:group:123',
      ].forEach(fragment => {
        it('injects the sidebar if a direct link is present', () => {
          const tab = createTab();
          tab.url += fragment;
          fakeChromeAPI.tabs.onUpdated.listener(
            tab.id,
            { status: 'loading' },
            tab,
          );
          fakeChromeAPI.tabs.onUpdated.listener(
            tab.id,
            { status: 'complete' },
            tab,
          );
          assert.equal(tabState[tab.id].state, 'active');
        });
      });

      it('injects the sidebar if the page rewrites the URL fragment', () => {
        const tab = createTab();
        const origURL = tab.url;
        tab.url += '#annotations:456';
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );

        // Simulate client side JS rewriting the URL fragment before the sidebar
        // is injected
        tab.url = origURL + '#modified-fragment';
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'complete' },
          tab,
        );
        assert.equal(tabState[tab.id].state, 'active');
      });

      it('updates the badge count', async () => {
        const tab = createTab();

        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'complete' },
          tab,
        );

        // Wait for tab state change to be processed.
        await delay(0);

        assert.calledWith(
          fakeTabState.updateAnnotationCount,
          tab.id,
          'http://example.com/foo.html',
        );
      });

      it('does not update the badge count if the option is disabled', () => {
        const tab = createTab();
        fakeChromeAPI.storage.sync.get.resolves({ badge: false });

        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'loading' },
          tab,
        );
        fakeChromeAPI.tabs.onUpdated.listener(
          tab.id,
          { status: 'complete' },
          tab,
        );

        assert.notCalled(fakeTabState.updateAnnotationCount);
      });
    });

    describe('when a tab is replaced', () => {
      beforeEach(async () => {
        await ext.init();
      });

      it('preserves the active state of the previous tab', () => {
        fakeTabState.getState = sandbox.stub().returns({
          state: 'active',
        });
        fakeChromeAPI.tabs.onReplaced.listener(1, 2);
        assert.calledWith(fakeTabState.clearTab, 2);
        assert.calledWith(fakeTabState.setState, 1, {
          state: 'active',
          ready: true,
        });
      });

      it('reactivates errored tabs', () => {
        fakeTabState.getState = sandbox.stub().returns({
          state: 'errored',
        });
        fakeChromeAPI.tabs.onReplaced.listener(1, 2);
        assert.calledWith(fakeTabState.setState, 1, {
          state: 'active',
          ready: true,
        });
      });
    });

    describe('when a tab is removed', () => {
      beforeEach(async () => {
        fakeTabState.clearTab = sandbox.spy();
        await ext.init();
      });

      it('clears the tab', () => {
        fakeChromeAPI.tabs.onRemoved.listener(1);
        assert.calledWith(fakeTabState.clearTab, 1);
      });
    });

    describe('when the browser icon is clicked', () => {
      beforeEach(async () => {
        await ext.init();
      });

      it('activates the tab if the tab is inactive', async () => {
        fakeTabState.isTabInactive.returns(true);
        const tab = {
          id: 1,
          url: 'http://example.com/foo.html',
        };
        fakeChromeAPI.browserAction.onClicked.listener(tab);

        // Wait for any extra permissions to be granted (none needed here).
        await delay(0);

        assert.calledWith(
          fakeSidebarInjector.requestExtraPermissionsForTab,
          tab,
        );
        assert.called(fakeTabState.activateTab);
        assert.calledWith(fakeTabState.activateTab, 1);
      });

      it('reports error if user rejects permissions request', async () => {
        fakeSidebarInjector.requestExtraPermissionsForTab.returns(false);
        fakeTabState.isTabInactive.returns(true);
        const tab = {
          id: 1,
          url: 'http://example.com/foo.html',
        };
        fakeChromeAPI.browserAction.onClicked.listener(tab);

        // Wait for user to "reject" permissions request.
        await delay(0);

        assert.notCalled(fakeTabState.activateTab);
        assert.calledOnce(fakeTabState.errorTab);
        assert.calledWith(
          fakeTabState.errorTab,
          1,
          sinon.match({
            message:
              'Hypothesis could not get the permissions needed to load in this tab',
          }),
        );
      });

      it('deactivates the tab if the tab is active', () => {
        fakeTabState.isTabActive.returns(true);
        fakeChromeAPI.browserAction.onClicked.listener({
          id: 1,
          url: 'http://example.com/foo.html',
        });
        assert.called(fakeTabState.deactivateTab);
        assert.calledWith(fakeTabState.deactivateTab, 1);
      });
    });
  });

  describe('when injection fails', () => {
    function triggerInstall() {
      const tab = { id: 1, url: 'file://foo.html', status: 'complete' };
      const tabState = {
        state: 'active',
        extensionSidebarInstalled: false,
        ready: true,
      };
      fakeChromeAPI.tabs.get.resolves(tab);
      fakeTabState.isTabActive.withArgs(1).returns(true);
      fakeTabState.getState = sandbox.stub().returns(tabState);
      fakeTabState.onChangeHandler(tab.id, tabState, null);
    }

    beforeEach(async () => {
      await ext.init();
    });

    const injectErrorCases = [
      errors.LocalFileError,
      errors.NoFileAccessError,
      errors.RestrictedProtocolError,
    ];

    injectErrorCases.forEach(ErrorType => {
      describe('with ' + ErrorType.name, () => {
        it('puts the tab into an errored state', () => {
          const injectError = Promise.reject(new ErrorType('msg'));
          fakeSidebarInjector.injectIntoTab.returns(injectError);

          triggerInstall();

          return toResult(injectError).then(() => {
            assert.called(fakeTabState.errorTab);
            assert.calledWith(fakeTabState.errorTab, 1);
          });
        });

        it('shows the help page for ' + ErrorType.name, () => {
          const tab = { id: 1, url: 'file://foo.html' };

          fakeTabState.getState.returns({
            state: 'errored',
            error: new ErrorType('msg'),
          });
          fakeTabState.isTabErrored.withArgs(1).returns(true);
          fakeChromeAPI.browserAction.onClicked.listener(tab);

          assert.called(fakeHelpPage.showHelpForError);
          assert.calledWith(
            fakeHelpPage.showHelpForError,
            tab,
            sinon.match.instanceOf(ErrorType),
          );
        });

        it('does not log known errors', () => {
          const error = new Error('Some error');
          fakeErrors.shouldIgnoreInjectionError = function () {
            return true;
          };
          const injectError = Promise.reject(error);
          fakeSidebarInjector.injectIntoTab.returns(injectError);

          triggerInstall();

          return toResult(injectError).then(() => {
            assert.notCalled(fakeErrors.report);
          });
        });

        it('logs unexpected errors', () => {
          const error = new ErrorType('msg');
          const injectError = Promise.reject(error);
          fakeSidebarInjector.injectIntoTab.returns(injectError);

          triggerInstall();

          return toResult(injectError).then(() => {
            assert.calledWith(
              fakeErrors.report,
              error,
              'Injecting Hypothesis sidebar',
              { url: 'file://foo.html' },
            );
          });
        });
      });
    });
  });

  describe('TabState.onchange', () => {
    let onChangeHandler;
    let tab;

    // simulate a tab state change from 'prev' to 'current'
    function onTabStateChange(current, prev) {
      return onChangeHandler(
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
          : null,
      );
    }

    beforeEach(() => {
      tab = { id: 1, status: 'complete' };
      fakeChromeAPI.tabs.get = sandbox.stub().resolves(tab);
      onChangeHandler = ext._onTabStateChange;
    });

    it('updates the browser icon', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
      });

      await onTabStateChange('active', 'inactive');

      assert.calledWith(fakeBrowserAction.update, 1, {
        state: 'active',
      });
    });

    it('injects the sidebar if the tab has been activated', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        ready: true,
      });
      fakeTabState.isTabActive.returns(true);

      await onTabStateChange('active', 'inactive');

      assert.calledWith(fakeSidebarInjector.injectIntoTab, tab);
    });

    it('configures the client to load assets from the extension', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        ready: true,
      });
      fakeTabState.isTabActive.returns(true);

      await onTabStateChange('active', 'inactive');

      assert.calledWith(fakeSidebarInjector.injectIntoTab, tab, {
        assetRoot: 'chrome://1234/client/',
        notebookAppUrl: 'chrome://1234/client/notebook.html',
        profileAppUrl: 'chrome://1234/client/profile.html',
        sidebarAppUrl: 'chrome://1234/client/app.html',
      });
    });

    it('does not inject the sidebar if already installed', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        extensionSidebarInstalled: true,
        ready: true,
      });
      fakeTabState.isTabActive.returns(true);

      await onTabStateChange('active', 'active');

      assert.notCalled(fakeSidebarInjector.injectIntoTab);
    });

    it('removes the sidebar if the tab has been deactivated', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'inactive',
        extensionSidebarInstalled: true,
        ready: true,
      });
      fakeTabState.isTabInactive.returns(true);
      fakeChromeAPI.tabs.get = sandbox.stub().resolves({
        id: 1,
        status: 'complete',
      });

      await onTabStateChange('inactive', 'active');

      assert.calledWith(fakeSidebarInjector.removeFromTab, tab);
    });

    it('does not remove the sidebar if not installed', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'inactive',
        extensionSidebarInstalled: false,
        ready: true,
      });
      fakeTabState.isTabInactive.returns(true);
      fakeChromeAPI.tabs.get = sandbox
        .stub()
        .resolves({ id: 1, status: 'complete' });

      await onTabStateChange('inactive', 'active');

      assert.notCalled(fakeSidebarInjector.removeFromTab);
    });

    it('does nothing with the sidebar if the tab is errored', async () => {
      fakeTabState.isTabErrored.returns(true);

      await onTabStateChange('errored', 'inactive');

      assert.notCalled(fakeSidebarInjector.injectIntoTab);
      assert.notCalled(fakeSidebarInjector.removeFromTab);
    });

    it('does nothing if the tab is still loading', async () => {
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        extensionSidebarInstalled: false,
        ready: false,
      });

      await onTabStateChange('active', 'inactive');

      assert.notCalled(fakeSidebarInjector.injectIntoTab);
    });

    it('clears the tab if fetching tab data fails', async () => {
      fakeChromeAPI.tabs.get.rejects(new Error('Something went wrong'));
      fakeTabState.getState = sandbox.stub().returns({
        state: 'active',
        extensionSidebarInstalled: false,
        ready: false,
      });
      await onTabStateChange('active', 'inactive');
      assert.called(fakeTabState.clearTab);
    });
  });
});
