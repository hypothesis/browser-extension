import * as errors from '../../src/background/errors';
import {
  SidebarInjector,
  $imports,
} from '../../src/background/sidebar-injector';
import { toResult } from '../promise-util';

// The root URL for the extension returned by the
// extensionURL(path) fake
const EXTENSION_BASE_URL = 'chrome-extension://hypothesis';

const PDF_VIEWER_BASE_URL = EXTENSION_BASE_URL + '/pdfjs/web/viewer.html?file=';

/**
 * Creates an <iframe> for testing the effects of code injected
 * into the page by the sidebar injector
 */
function createTestFrame() {
  const frame = document.createElement('iframe');
  document.body.appendChild(frame);
  frame.contentDocument.body.appendChild = function () {
    // no-op to avoid trying to actually load <script> tags injected into
    // the page
  };
  return frame;
}

// Example of real VitalSource URLs for: 1) The top level frame, 2) The ebook reader frame, where we need
// to inject the client and 3) the ebook chapter content frame.
const vitalSourceFrames = {
  main: {
    frameId: 1,
    url: 'https://bookshelf.vitalsource.com/reader/books/9781400847402/epubcfi/6/22[%3Bvnd.vst.idref%3Dch2]!/4',
  },

  reader: {
    frameId: 2,
    url: 'https://jigsaw.vitalsource.com/mosaic/wrapper.html?uuid=789115e7-e6ae-46cb-edcd-b9e68609e590&type=book',
  },

  content: {
    frameId: 3,
    url: 'https://jigsaw.vitalsource.com/books/9781400847402/epub/OEBPS/10.chaptertwo.xhtml?favre=brett',
  },
};

describe('SidebarInjector', function () {
  let injector;
  let fakeChromeAPI;

  let fakeExecuteFunction;
  let fakeExecuteScript;

  // The content type that the detection script injected into
  // the page should report ('HTML' or 'PDF')
  let contentType;
  // The return value from the content script which checks whether
  // the sidebar has already been injected into the page
  let isAlreadyInjected;

  // An <iframe> created by some tests to verify the effects on the DOM of
  // code injected into the page by the sidebar
  let contentFrame;

  // Mock return value from embed.js when injected into page
  let embedScriptReturnValue;

  // Set of optional permissions that the extension currently has
  let permissions;

  beforeEach(function () {
    contentType = 'HTML';
    isAlreadyInjected = false;
    contentFrame = undefined;
    embedScriptReturnValue = {
      installedURL: EXTENSION_BASE_URL + '/client/app.html',
    };

    fakeExecuteFunction = sinon.spy(async ({ func, args }) => {
      if (contentFrame) {
        const codeStr = `(${func})(${args
          .map(a => JSON.stringify(a))
          .join(',')})`;
        contentFrame.contentWindow.eval(codeStr);
      }
      if (func.name.match(/detectContentType/)) {
        return { type: contentType };
      } else {
        return null;
      }
    });

    fakeExecuteScript = sinon.spy(async ({ file }) => {
      if (file.match(/boot/)) {
        return embedScriptReturnValue;
      } else if (file.match(/destroy/)) {
        return isAlreadyInjected;
      } else {
        return false;
      }
    });

    // Optional permissions that the extension is allowed to request.
    const allowedPermissions = ['webNavigation'];
    permissions = new Set();

    fakeChromeAPI = {
      extension: {
        isAllowedFileSchemeAccess: sinon.stub().resolves(true),
      },

      runtime: {
        getURL: sinon.spy(path => EXTENSION_BASE_URL + path),
      },

      permissions: {
        getAll: sinon.stub().callsFake(async () => {
          return {
            permissions: [...permissions],
          };
        }),
        request: sinon.stub().callsFake(async request => {
          const allowed = request.permissions.every(perm =>
            allowedPermissions.includes(perm)
          );
          if (allowed) {
            request.permissions.forEach(perm => permissions.add(perm));
          }
          return allowed;
        }),
      },

      tabs: {
        update: sinon.stub(),
      },

      webNavigation: {
        getAllFrames: sinon.stub().callsFake(async () => {
          if (!permissions.has('webNavigation')) {
            throw new Error('Invalid permissions');
          }
          return Object.values(vitalSourceFrames);
        }),
      },
    };

    $imports.$mock({
      './chrome-api': {
        chromeAPI: fakeChromeAPI,
        executeFunction: fakeExecuteFunction,
        executeScript: fakeExecuteScript,
      },
    });

    injector = new SidebarInjector();
  });

  afterEach(function () {
    if (contentFrame) {
      contentFrame.parentNode.removeChild(contentFrame);
    }

    $imports.$restore();
  });

  describe('.injectIntoTab', function () {
    const urls = [
      'chrome://version',
      'chrome-devtools://host',
      'chrome-extension://1234/foo.html',
      'chrome-extension://1234/foo.pdf',
    ];
    urls.forEach(function (url) {
      it(
        'bails early when trying to load an unsupported url: ' + url,
        function () {
          return toResult(injector.injectIntoTab({ id: 1, url: url })).then(
            function (result) {
              assert.ok(result.error);
              assert.instanceOf(result.error, errors.RestrictedProtocolError);
              assert.notCalled(fakeExecuteScript);
            }
          );
        }
      );
    });

    [{ id: 1 }, { url: 'https://foobar.com' }].forEach(tab => {
      it('throws if tab does not have ID or URL', async () => {
        let error;
        try {
          await injector.injectIntoTab(tab);
        } catch (e) {
          error = e;
        }
        assert.instanceOf(error, Error);
        assert.equal(error.message, 'Tab is missing ID or URL');
      });
    });

    it('succeeds if the tab is already displaying the embedded PDF viewer', function () {
      const url =
        PDF_VIEWER_BASE_URL + encodeURIComponent('http://origin/foo.pdf');
      return injector.injectIntoTab({ id: 1, url: url });
    });

    describe('when viewing a remote PDF', function () {
      const url = 'http://example.com/foo.pdf';

      it('injects hypothesis into the page', function () {
        contentType = 'PDF';
        const spy = fakeChromeAPI.tabs.update.resolves({ tab: 1 });
        return injector.injectIntoTab({ id: 1, url: url }).then(function () {
          assert.calledWith(spy, 1, {
            url: PDF_VIEWER_BASE_URL + encodeURIComponent(url),
          });
        });
      });

      it('preserves #annotations fragments in the URL', function () {
        contentType = 'PDF';
        const spy = fakeChromeAPI.tabs.update.resolves({ tab: 1 });
        const hash = '#annotations:456';
        return injector
          .injectIntoTab({ id: 1, url: url + hash })
          .then(function () {
            assert.calledWith(spy, 1, {
              url: PDF_VIEWER_BASE_URL + encodeURIComponent(url) + hash,
            });
          });
      });
    });

    describe('when viewing a remote HTML page', function () {
      it('injects hypothesis into the page', function () {
        const url = 'http://example.com/foo.html';

        return injector.injectIntoTab({ id: 1, url: url }).then(function () {
          assert.calledWith(fakeExecuteScript, {
            tabId: 1,
            file: sinon.match('/client/build/boot.js'),
          });
        });
      });

      it('reports an error if Hypothesis is already embedded', function () {
        embedScriptReturnValue = {
          installedURL: 'https://hypothes.is/app.html',
        };
        const url = 'http://example.com';
        return toResult(injector.injectIntoTab({ id: 1, url: url })).then(
          function (result) {
            assert.ok(result.error);
            assert.instanceOf(result.error, errors.AlreadyInjectedError);
          }
        );
      });

      it('injects config options into the page', function () {
        contentFrame = createTestFrame();
        const url = 'http://example.com';
        return injector
          .injectIntoTab({ id: 1, url: url }, { annotations: '456' })
          .then(function () {
            const configEl = contentFrame.contentDocument.querySelector(
              'script.js-hypothesis-config'
            );
            assert.ok(configEl);
            assert.deepEqual(JSON.parse(configEl.textContent), {
              annotations: '456',
            });
          });
      });
    });

    describe('when viewing a VitalSource book', () => {
      const injectClient = () =>
        injector.injectIntoTab({ id: 1, url: vitalSourceFrames.main.url });

      it('injects client into book viewer frame', async () => {
        await injectClient();

        assert.calledWith(
          fakeExecuteFunction,
          sinon.match({
            tabId: 1,
            frameId: vitalSourceFrames.reader.frameId,
            func: { name: 'setClientConfig' },
          })
        );

        assert.calledWith(fakeExecuteScript, {
          tabId: 1,
          frameId: vitalSourceFrames.reader.frameId,
          file: '/client/build/boot.js',
        });
      });

      it('requests "webNavigation" permission if not present', async () => {
        await injectClient();
        assert.calledWith(fakeChromeAPI.permissions.request, {
          permissions: ['webNavigation'],
        });
      });

      it('does not request "webNavigation" permission if already granted', async () => {
        permissions.add('webNavigation');
        await injectClient();
        assert.notCalled(fakeChromeAPI.permissions.request);
      });

      it('rejects if "webNavigation" permission is denied', async () => {
        fakeChromeAPI.permissions.request.resolves(false);

        let error;
        try {
          await injectClient();
        } catch (e) {
          error = e;
        }

        assert.instanceOf(error, Error);
        assert.equal(
          error.message,
          'The extension was not granted required permissions'
        );
      });

      it('rejects if frames cannot be enumerated', async () => {
        fakeChromeAPI.webNavigation.getAllFrames.returns(null);

        let error;
        try {
          await injectClient();
        } catch (e) {
          error = e;
        }

        assert.instanceOf(error, Error);
        assert.equal(error.message, 'Could not list frames in tab');
      });

      it('rejects if book reader frame cannot be found', async () => {
        fakeChromeAPI.webNavigation.getAllFrames.resolves([]);

        let error;
        try {
          await injectClient();
        } catch (e) {
          error = e;
        }

        assert.instanceOf(error, Error);
        assert.equal(error.message, 'Book viewer frame not found');
      });
    });

    describe('when viewing a local PDF', function () {
      describe('when file access is enabled', function () {
        it('loads the PDFjs viewer', function () {
          const spy = fakeChromeAPI.tabs.update.resolves([]);
          const url = 'file:///foo.pdf';
          contentType = 'PDF';

          return injector.injectIntoTab({ id: 1, url: url }).then(function () {
            assert.called(spy);
            assert.calledWith(spy, 1, {
              url: PDF_VIEWER_BASE_URL + encodeURIComponent('file:///foo.pdf'),
            });
          });
        });
      });

      describe('when file access is disabled', function () {
        beforeEach(function () {
          fakeChromeAPI.extension.isAllowedFileSchemeAccess.resolves(false);
          contentType = 'PDF';
        });

        it('returns an error', function () {
          const url = 'file://foo.pdf';

          const promise = injector.injectIntoTab({ id: 1, url: url });
          return toResult(promise).then(function (result) {
            assert.instanceOf(result.error, errors.NoFileAccessError);
            assert.notCalled(fakeExecuteScript);
          });
        });
      });

      describe('when viewing a local HTML file', function () {
        it('returns an error', function () {
          const url = 'file://foo.html';
          const promise = injector.injectIntoTab({ id: 1, url: url });
          return toResult(promise).then(function (result) {
            assert.instanceOf(result.error, errors.LocalFileError);
          });
        });
      });
    });
  });

  describe('.removeFromTab', function () {
    it('bails early when trying to unload a chrome url', function () {
      const url = 'chrome://extensions/';

      return injector.removeFromTab({ id: 1, url: url }).then(function () {
        assert.notCalled(fakeExecuteScript);
      });
    });

    const protocols = ['chrome:', 'chrome-devtools:', 'chrome-extension:'];
    protocols.forEach(function (protocol) {
      it(
        'bails early when trying to unload an unsupported ' + protocol + ' url',
        function () {
          const url = protocol + '//foobar/';

          return injector.removeFromTab({ id: 1, url: url }).then(function () {
            assert.notCalled(fakeExecuteScript);
          });
        }
      );
    });

    describe('when viewing a PDF', function () {
      it('reverts the tab back to the original document', function () {
        const spy = fakeChromeAPI.tabs.update.resolves([]);
        const url =
          PDF_VIEWER_BASE_URL +
          encodeURIComponent('http://example.com/foo.pdf') +
          '#foo';
        return injector.removeFromTab({ id: 1, url: url }).then(function () {
          assert.calledWith(spy, 1, {
            url: 'http://example.com/foo.pdf#foo',
          });
        });
      });

      it('drops #annotations fragments', function () {
        const spy = fakeChromeAPI.tabs.update.resolves([]);
        const url =
          PDF_VIEWER_BASE_URL +
          encodeURIComponent('http://example.com/foo.pdf') +
          '#annotations:456';
        return injector.removeFromTab({ id: 1, url: url }).then(function () {
          assert.calledWith(spy, 1, {
            url: 'http://example.com/foo.pdf',
          });
        });
      });
    });

    describe('when viewing an HTML page', function () {
      it('injects a destroy script into the page', function () {
        isAlreadyInjected = true;
        return injector
          .removeFromTab({ id: 1, url: 'http://example.com/foo.html' })
          .then(function () {
            assert.calledWith(fakeExecuteScript, {
              tabId: 1,
              file: sinon.match('/unload-client.js'),
            });
          });
      });
    });

    describe('when viewing a VitalSource book', () => {
      const removeClient = () =>
        injector.removeFromTab({ id: 1, url: vitalSourceFrames.main.url });

      it('injects a destroy script into the correct frame', async () => {
        await removeClient();

        assert.calledWith(fakeExecuteScript, {
          tabId: 1,
          frameId: vitalSourceFrames.reader.frameId,
          file: '/unload-client.js',
        });
      });

      it('does nothing if the book viewer frame is not found', async () => {
        fakeChromeAPI.webNavigation.getAllFrames.returns([]);

        await removeClient();

        assert.notCalled(fakeExecuteScript);
      });

      it('rejects if permission to list frames was denied', async () => {
        fakeChromeAPI.permissions.request.resolves(false);

        let error;
        try {
          await removeClient();
        } catch (e) {
          error = e;
        }

        assert.instanceOf(error, Error);
        assert.equal(
          error.message,
          'The extension was not granted required permissions'
        );
      });
    });
  });
});
