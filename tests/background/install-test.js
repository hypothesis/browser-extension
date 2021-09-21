let extension;

function FakeHypothesisChromeExtension(deps) {
  extension = this; // eslint-disable-line consistent-this

  this.deps = deps;
  this.listen = sinon.stub();
  this.install = sinon.stub();
  this.firstRun = sinon.stub();
}

function eventListenerStub() {
  return {
    addListener: sinon.stub(),
  };
}

describe('install', function () {
  let origChrome;
  let fakeChrome;
  let install;

  beforeEach(function () {
    fakeChrome = {
      isFakeChrome: true,

      tabs: {},
      browserAction: {},
      storage: {},
      extension: {
        getURL: sinon.stub(),
      },
      runtime: {
        requestUpdateCheck: sinon.stub(),
        onInstalled: eventListenerStub(),
        onMessageExternal: eventListenerStub(),
        onUpdateAvailable: eventListenerStub(),
      },
      management: {
        getSelf: function (cb) {
          cb({ installType: 'normal', id: '1234' });
        },
      },
    };

    origChrome = window.chrome;
    window.chrome = fakeChrome;

    // Defer requiring `common/install` until `window.chrome` is initialized
    // for the first time because top-level statements in the module depend on
    // it.
    install = require('../../src/background/install');
    install.$imports.$mock({
      './hypothesis-chrome-extension': FakeHypothesisChromeExtension,
    });
    install.init();
  });

  afterEach(function () {
    window.chrome = origChrome;
    install.$imports.$restore();
  });

  context('when the extension is installed', function () {
    function triggerInstallEvent() {
      const cb = fakeChrome.runtime.onInstalled.addListener.args[0][0];
      cb({ reason: 'install' });
    }

    it("calls the extension's first run hook", function () {
      triggerInstallEvent();
      assert.calledWith(extension.firstRun, {
        id: '1234',
        installType: 'normal',
      });
    });
  });
});
