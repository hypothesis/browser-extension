import { init, $imports } from '../../src/background/install';

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
  let fakeChrome;

  beforeEach(function () {
    fakeChrome = {
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

    $imports.$mock({
      './hypothesis-chrome-extension': FakeHypothesisChromeExtension,
    });
    init(fakeChrome);
  });

  afterEach(function () {
    $imports.$restore();
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
