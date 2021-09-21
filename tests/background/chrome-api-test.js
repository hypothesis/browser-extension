import { getChromeAPI } from '../../src/background/chrome-api';

describe('getChromeAPI', () => {
  function fakeListener() {
    return { addListener: sinon.stub() };
  }

  let fakeChrome;

  beforeEach(() => {
    fakeChrome = {
      browserAction: {
        onClicked: fakeListener(),
        setBadgeBackgroundColor: sinon.stub(),
        setBadgeText: sinon.stub(),
        setIcon: sinon.stub(),
        setTitle: sinon.stub(),
      },

      extension: {
        isAllowedFileSchemeAccess: sinon.stub(),
      },

      runtime: {
        lastError: null,
        getURL: sinon.stub(),
      },

      tabs: {
        create: sinon.stub(),
        get: sinon.stub(),
        executeScript: sinon.stub(),
        onCreated: fakeListener(),
        onReplaced: fakeListener(),
        onRemoved: fakeListener(),
        onUpdated: fakeListener(),
        query: sinon.stub(),
        update: sinon.stub(),
      },

      storage: {
        sync: {
          get: sinon.stub(),
        },
      },
    };
  });

  it('wrapped methods call browser API', async () => {
    const syncAPIs = new Set([fakeChrome.runtime.getURL]);

    const chromeAPI = getChromeAPI(fakeChrome);

    for (let namespace of Object.keys(fakeChrome)) {
      for (let methodName of Object.keys(fakeChrome[namespace])) {
        const method = fakeChrome[namespace][methodName];
        if (typeof method !== 'function') {
          // Skip listeners `on<Event>` and nested namespaces (eg. `storage.sync.get`).
          continue;
        }

        const arg = {};
        let result = chromeAPI[namespace][methodName](arg);
        assert.calledWith(method, arg);

        if (!syncAPIs.has(method)) {
          const expectedResult = {};
          method.yield(expectedResult);
          assert.equal(await result, expectedResult);
        }
      }
    }
  });

  it('wrapped methods reject if an error occurs', async () => {
    const chromeAPI = getChromeAPI(fakeChrome);

    fakeChrome.runtime.lastError = new Error('Something went wrong');
    fakeChrome.tabs.get.yields(null);

    let error;
    try {
      await chromeAPI.tabs.get(1);
    } catch (e) {
      error = e;
    }

    assert.equal(error, fakeChrome.runtime.lastError);
  });
});
