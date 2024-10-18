import { getChromeAPI, getExtensionId } from '../../src/background/chrome-api';

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
          onCreated: fakeListener(),
          onReplaced: fakeListener(),
          onRemoved: fakeListener(),
          onUpdated: fakeListener(),
          query: sinon.stub(),
          update: sinon.stub(),
        },

        scripting: {
          executeScript: sinon.stub(),
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

      for (const namespace of Object.keys(fakeChrome)) {
        for (const methodName of Object.keys(fakeChrome[namespace])) {
          const method = fakeChrome[namespace][methodName];
          if (typeof method !== 'function') {
            // Skip listeners `on<Event>` and nested namespaces (eg. `storage.sync.get`).
            continue;
          }

          const expectedResult = {};
          if (!syncAPIs.has(method)) {
            method.resolves(expectedResult);
          }

          const arg = {};
          const result = chromeAPI[namespace][methodName](arg);
          assert.calledWith(method, arg);

          if (!syncAPIs.has(method)) {
            assert.equal(await result, expectedResult);
          }
        }
      }
    });

    it('wrapped methods reject if an error occurs', async () => {
      const chromeAPI = getChromeAPI(fakeChrome);

      const expectedError = new Error('Something went wrong');
      fakeChrome.tabs.get.rejects(expectedError);

      let error;
      try {
        await chromeAPI.tabs.get(1);
      } catch (e) {
        error = e;
      }

      assert.equal(error, expectedError);
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
          getAllFrames: sinon.stub().resolves(frames),
        };

        const actualFrames = await chromeAPI.webNavigation.getAllFrames();

        assert.equal(actualFrames, frames);
      });
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
