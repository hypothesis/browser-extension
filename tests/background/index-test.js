import { init, $imports } from '../../src/background';

let extension;

function FakeExtension() {
  extension = this; // eslint-disable-line consistent-this

  this.activate = sinon.stub();
  this.init = sinon.stub().resolves();
  this.install = sinon.stub();
  this.firstRun = sinon.stub();
}

function eventListenerStub() {
  return {
    addListener: sinon.stub(),
  };
}

describe('background/index', () => {
  let fakeChromeAPI;

  beforeEach(() => {
    fakeChromeAPI = {
      runtime: {
        getURL: sinon.stub(),
        requestUpdateCheck: sinon.stub().resolves(),
        onInstalled: eventListenerStub(),
        onMessageExternal: eventListenerStub(),
        onUpdateAvailable: eventListenerStub(),
      },
      management: {
        getSelf: sinon.stub().resolves({ installType: 'normal', id: '1234' }),
      },
      tabs: {
        update: sinon.stub(),
      },
    };

    $imports.$mock({
      './chrome-api': { chromeAPI: fakeChromeAPI },
      './extension': { Extension: FakeExtension },
    });
    init();
  });

  afterEach(() => {
    $imports.$restore();
  });

  /**
   * Simulate an external request being sent to the extension from a web page,
   * such as the bouncer (hyp.is) service, via the `chrome.runtime.sendMessage`
   * API.
   */
  function simulateExternalMessage(request, sender, sendResponse) {
    const cb = fakeChromeAPI.runtime.onMessageExternal.addListener.args[0][0];
    return cb(request, sender, sendResponse);
  }

  context('when the extension is installed', () => {
    function triggerInstallEvent() {
      const cb = fakeChromeAPI.runtime.onInstalled.addListener.args[0][0];
      return cb({ reason: 'install' });
    }

    it("calls the extension's first run hook", async () => {
      await triggerInstallEvent();
      assert.calledWith(extension.firstRun, {
        id: '1234',
        installType: 'normal',
      });
    });
  });

  describe('bouncer (hyp.is) message handling', () => {
    it('responds to basic "ping" message', () => {
      const sender = {};
      const sendResponse = sinon.stub();
      simulateExternalMessage({ type: 'ping' }, sender, sendResponse);
      assert.calledWith(sendResponse, { type: 'pong', features: [] });
    });

    it('responds to "ping" message with `queryFeatures`', () => {
      const sender = {};
      const sendResponse = sinon.stub();
      simulateExternalMessage(
        { type: 'ping', queryFeatures: ['activate'] },
        sender,
        sendResponse,
      );
      assert.calledWith(sendResponse, { type: 'pong', features: ['activate'] });
    });

    it('responds to "activate" message with URL', () => {
      const sender = { tab: { id: 123 } };
      const sendResponse = sinon.stub();

      simulateExternalMessage(
        {
          type: 'activate',
          url: 'https://example.com',
          query: '#annotations:1234',
        },
        sender,
        sendResponse,
      );

      assert.calledWith(fakeChromeAPI.tabs.update, 123, {
        url: 'https://example.com',
      });
      assert.calledWith(extension.activate, 123, {
        afterNavigationTo: 'https://example.com',
        query: '#annotations:1234',
      });
      assert.calledWith(sendResponse, { active: true });
    });

    it('responds to "activate" message without URL', () => {
      const sender = { tab: { id: 123 } };
      const sendResponse = sinon.stub();

      simulateExternalMessage(
        {
          type: 'activate',
          query: '#annotations:1234',
        },
        sender,
        sendResponse,
      );

      assert.notCalled(fakeChromeAPI.tabs.update);
      assert.calledWith(
        extension.activate,
        123,
        sinon.match({
          query: '#annotations:1234',
        }),
      );
      assert.calledWith(sendResponse, { active: true });
    });

    it('ignores "activate" message that did not come from a tab', () => {
      const sender = {};
      const sendResponse = sinon.stub();

      simulateExternalMessage(
        {
          type: 'activate',
          query: '#annotations:1234',
        },
        sender,
        sendResponse,
      );

      assert.notCalled(fakeChromeAPI.tabs.update);
    });
  });
});
