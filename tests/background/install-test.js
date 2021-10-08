import { init, $imports } from '../../src/background/install';

let extension;

function FakeHypothesisChromeExtension() {
  extension = this; // eslint-disable-line consistent-this

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
  let fakeChromeAPI;

  beforeEach(function () {
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
    };

    $imports.$mock({
      './chrome-api': { chromeAPI: fakeChromeAPI },
      './hypothesis-chrome-extension': FakeHypothesisChromeExtension,
    });
    init();
  });

  afterEach(function () {
    $imports.$restore();
  });

  context('when the extension is installed', function () {
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
});
