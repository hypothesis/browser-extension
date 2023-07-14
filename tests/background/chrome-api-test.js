import {
  getChromeAPI,
  executeFunction,
  executeScript,
  getExtensionId,
} from '../../src/background/chrome-api';

// Helper defined at top level to simplify its stringified representation.
function testFunc(a, b) {
  return a + b;
}

describe('chrome-api', () => {
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

        management: {
          getSelf: sinon.stub(),
        },

        runtime: {
          lastError: null,
          getURL: sinon.stub(),
        },

        permissions: {
          getAll: sinon.stub(),
          request: sinon.stub(),
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

    describe('APIs that require optional permissions', () => {
      it('rejects if permission has not been granted', async () => {
        const chromeAPI = getChromeAPI(fakeChrome);

        let error;
        try {
          await chromeAPI.webNavigation.getAllFrames();
        } catch (e) {
          error = e;
        }

        assert.ok(error);
      });

      it('succeeds if permission has been granted', async () => {
        const chromeAPI = getChromeAPI(fakeChrome);

        const frames = [];

        // Simulate the "webNavigation" permission being granted, which will
        // make the `chrome.webNavigation` property accessible.
        fakeChrome.webNavigation = {
          getAllFrames: sinon.stub().yields(frames),
        };

        const actualFrames = await chromeAPI.webNavigation.getAllFrames();

        assert.equal(actualFrames, frames);
      });
    });
  });

  describe('executeFunction', () => {
    let fakeChromeAPI;

    beforeEach(() => {
      fakeChromeAPI = {
        tabs: {
          executeScript: sinon.stub().resolves(['result']),
        },
      };
    });

    it('calls `chrome.tabs.executeScript` with stringified source', async () => {
      const result = await executeFunction(
        {
          tabId: 1,
          func: testFunc,
          args: [1, 2],
        },
        fakeChromeAPI,
      );
      assert.calledWith(fakeChromeAPI.tabs.executeScript, 1, {
        frameId: undefined,
        code: '(function testFunc(a, b) {\n  return a + b;\n})(1,2)',
      });
      assert.equal(result, 'result');
    });

    it('sets frame ID if provided', async () => {
      const result = await executeFunction(
        {
          tabId: 1,
          frameId: 2,
          func: testFunc,
          args: [1, 2],
        },
        fakeChromeAPI,
      );
      assert.calledWith(fakeChromeAPI.tabs.executeScript, 1, {
        frameId: 2,
        code: '(function testFunc(a, b) {\n  return a + b;\n})(1,2)',
      });
      assert.equal(result, 'result');
    });
  });

  describe('executeScript', () => {
    let fakeChromeAPI;

    beforeEach(() => {
      fakeChromeAPI = {
        tabs: {
          executeScript: sinon.stub().resolves(['result']),
        },
      };
    });

    it('calls `chrome.tabs.executeScript` with files', async () => {
      const result = await executeScript(
        {
          tabId: 1,
          file: 'foo.js',
        },
        fakeChromeAPI,
      );
      assert.calledWith(fakeChromeAPI.tabs.executeScript, 1, {
        frameId: undefined,
        file: 'foo.js',
      });
      assert.equal(result, 'result');
    });

    it('sets frame ID if provided', async () => {
      const result = await executeScript(
        {
          tabId: 1,
          frameId: 2,
          file: 'foo.js',
        },
        fakeChromeAPI,
      );
      assert.calledWith(fakeChromeAPI.tabs.executeScript, 1, {
        frameId: 2,
        file: 'foo.js',
      });
      assert.deepEqual(result, 'result');
    });
  });

  describe('getExtensionId', () => {
    let fakeChromeAPI;
    const id = 'hypothesisId';

    beforeEach(() => {
      fakeChromeAPI = {
        runtime: { id },
      };
    });

    it('gets ID from `chrome.runtime.id`', () => {
      assert.equal(getExtensionId(fakeChromeAPI), id);
    });
  });
});
