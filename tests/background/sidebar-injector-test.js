import * as errors from '../../src/background/errors';
import { SidebarInjector } from '../../src/background/sidebar-injector';
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

describe('SidebarInjector', function () {
  let injector;
  let fakeChromeTabs;
  let fakeFileAccess;

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

  beforeEach(function () {
    contentType = 'HTML';
    isAlreadyInjected = false;
    contentFrame = undefined;
    embedScriptReturnValue = {
      installedURL: EXTENSION_BASE_URL + '/client/app.html',
    };

    const executeScriptSpy = sinon.spy(function (tabId, details, callback) {
      if (contentFrame) {
        contentFrame.contentWindow.eval(details.code);
      }

      if (details.code && details.code.match(/detectContentType/)) {
        callback([{ type: contentType }]);
      } else if (details.file && details.file.match(/boot/)) {
        callback([embedScriptReturnValue]);
      } else if (details.file && details.file.match(/destroy/)) {
        callback([isAlreadyInjected]);
      } else {
        callback([false]);
      }
    });

    fakeChromeTabs = {
      update: sinon.stub(),
      executeScript: executeScriptSpy,
    };
    fakeFileAccess = sinon.stub().yields(true);

    injector = new SidebarInjector(fakeChromeTabs, {
      isAllowedFileSchemeAccess: fakeFileAccess,
      extensionURL: sinon.spy(function (path) {
        return EXTENSION_BASE_URL + path;
      }),
    });
  });

  afterEach(function () {
    if (contentFrame) {
      contentFrame.parentNode.removeChild(contentFrame);
    }
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
          const spy = fakeChromeTabs.executeScript;
          return toResult(injector.injectIntoTab({ id: 1, url: url })).then(
            function (result) {
              assert.ok(result.error);
              assert.instanceOf(result.error, errors.RestrictedProtocolError);
              assert.notCalled(spy);
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
        const spy = fakeChromeTabs.update.yields({ tab: 1 });
        return injector.injectIntoTab({ id: 1, url: url }).then(function () {
          assert.calledWith(spy, 1, {
            url: PDF_VIEWER_BASE_URL + encodeURIComponent(url),
          });
        });
      });

      it('preserves #annotations fragments in the URL', function () {
        contentType = 'PDF';
        const spy = fakeChromeTabs.update.yields({ tab: 1 });
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
        const spy = fakeChromeTabs.executeScript;
        const url = 'http://example.com/foo.html';

        return injector.injectIntoTab({ id: 1, url: url }).then(function () {
          assert.calledWith(spy, 1, {
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

    describe('when viewing a local PDF', function () {
      describe('when file access is enabled', function () {
        it('loads the PDFjs viewer', function () {
          const spy = fakeChromeTabs.update.yields([]);
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
          fakeFileAccess.yields(false);
          contentType = 'PDF';
        });

        it('returns an error', function () {
          const url = 'file://foo.pdf';

          const promise = injector.injectIntoTab({ id: 1, url: url });
          return toResult(promise).then(function (result) {
            assert.instanceOf(result.error, errors.NoFileAccessError);
            assert.notCalled(fakeChromeTabs.executeScript);
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
      const spy = fakeChromeTabs.executeScript;
      const url = 'chrome://extensions/';

      return injector.removeFromTab({ id: 1, url: url }).then(function () {
        assert.notCalled(spy);
      });
    });

    const protocols = ['chrome:', 'chrome-devtools:', 'chrome-extension:'];
    protocols.forEach(function (protocol) {
      it(
        'bails early when trying to unload an unsupported ' + protocol + ' url',
        function () {
          const spy = fakeChromeTabs.executeScript;
          const url = protocol + '//foobar/';

          return injector.removeFromTab({ id: 1, url: url }).then(function () {
            assert.notCalled(spy);
          });
        }
      );
    });

    describe('when viewing a PDF', function () {
      it('reverts the tab back to the original document', function () {
        const spy = fakeChromeTabs.update.yields([]);
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
        const spy = fakeChromeTabs.update.yields([]);
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
            assert.calledWith(fakeChromeTabs.executeScript, 1, {
              file: sinon.match('/unload-client.js'),
            });
          });
      });
    });
  });
});
