import { detectContentType } from './detect-content-type';
import {
  AlreadyInjectedError,
  LocalFileError,
  NoFileAccessError,
  RestrictedProtocolError,
} from './errors';
import { promisify } from './util';

const CONTENT_TYPE_HTML = 'HTML';
const CONTENT_TYPE_PDF = 'PDF';

/** @param {Function} fn */
function toIIFEString(fn) {
  return '(' + fn.toString() + ')()';
}

/**
 * Adds a <script> tag containing JSON config data to the page.
 *
 * Note that this function is stringified and injected into the page via a
 * content script, so it cannot reference any external variables.
 *
 * @param {string} name
 * @param {string} content
 */
/* istanbul ignore next */
function addJSONScriptTag(name, content) {
  const scriptTag = document.createElement('script');
  scriptTag.className = name;
  scriptTag.textContent = content;
  scriptTag.type = 'application/json';
  document.head.appendChild(scriptTag);
}

/**
 * Extract the value returned by a content script injected via
 * chrome.tabs.executeScript() into the main frame of a page.
 *
 * executeScript() returns an array of results, one per frame which the script
 * was injected into.
 *
 * See https://developer.chrome.com/extensions/tabs#method-executeScript
 *
 * @param {Array<any>?} result
 */
function extractContentScriptResult(result) {
  if (Array.isArray(result) && result.length > 0) {
    return result[0];
  } else if (typeof result === 'object') {
    // Firefox currently returns an object instead of
    // an array from executeScript()
    return result;
  } else {
    return null;
  }
}

/**
 * A Chrome tab for which we have ID and URL information.
 *
 * This type avoids the need to check everywhere we access these properties.
 *
 * @typedef {chrome.tabs.Tab & { id: number, url: string }} Tab
 */

/**
 * Check that a tab has the necessary metadata to inject or un-inject the client.
 *
 * All "normal" tabs should have this information because of the extension's
 * permissions.
 *
 * @param {chrome.tabs.Tab} tab
 * @return {Tab}
 */
function checkTab(tab) {
  if (!tab.id || !tab.url) {
    throw new Error('Tab is missing ID or URL');
  }
  return /** @type {Tab} */ (tab);
}

/**
 * The SidebarInjector is used to deploy and remove the Hypothesis sidebar
 * from tabs. It also deals with loading PDF documents into the PDF.js viewer
 * when applicable.
 *
 * @param {chrome.tabs} chromeTabs
 * @param {Object} services
 * @param {(cb: (allowed: boolean) => void) => void} services.isAllowedFileSchemeAccess -
 *   A function that returns true if the user
 *   can access resources over the file:// protocol. See:
 *   https://developer.chrome.com/extensions/extension#method-isAllowedFileSchemeAccess
 * @param {(path: string) => string} services.extensionURL -
 *   A function that receives a path and returns an absolute
 *   url. See: https://developer.chrome.com/extensions/extension#method-getURL
 */
export function SidebarInjector(
  chromeTabs,
  { isAllowedFileSchemeAccess, extensionURL }
) {
  const executeScript = promisify(chromeTabs.executeScript);

  const pdfViewerBaseURL = extensionURL('/pdfjs/web/viewer.html');

  /**
   * Injects the Hypothesis sidebar into the tab provided.
   *
   * @param {chrome.tabs.Tab} tab - A tab object representing the tab to insert the sidebar
   *        into.
   * @param {object} config - An object containing configuration info that
   *        is passed to the app when it loads.
   *
   * Returns a promise that will be resolved if the injection succeeded
   * otherwise it will be rejected with an error.
   */
  this.injectIntoTab = function (tab, config = {}) {
    const tab_ = checkTab(tab);
    if (isFileURL(tab_.url)) {
      return injectIntoLocalDocument(tab_);
    } else {
      return injectIntoRemoteDocument(tab_, config);
    }
  };

  /**
   * Removes the Hypothesis sidebar from the tab provided.
   *
   * Returns a promise that will be resolved if the removal succeeded
   * otherwise it will be rejected with an error.
   *
   * @param {chrome.tabs.Tab} tab
   */
  this.removeFromTab = function (tab) {
    const tab_ = checkTab(tab);
    if (isPDFViewerURL(tab_.url)) {
      return removeFromPDF(tab_);
    } else {
      return removeFromHTML(tab_);
    }
  };

  /** @param {string} url */
  function getPDFViewerURL(url) {
    // Encode the original URL but preserve the fragment, so that a
    // '#annotations' fragment in the original URL will persist and trigger the
    // sidebar to focus and scroll to that annotation when the PDF viewer loads.
    const parsedURL = new URL(url);
    const hash = parsedURL.hash;
    parsedURL.hash = '';
    const encodedURL = encodeURIComponent(parsedURL.href);
    return pdfViewerBaseURL + '?file=' + encodedURL + hash;
  }

  /**
   * Returns true if the extension is permitted to inject a content script into
   * a tab with a given URL.
   *
   * @param {string} url
   */
  function canInjectScript(url) {
    let canInject;
    if (isSupportedURL(url)) {
      canInject = Promise.resolve(true);
    } else if (isFileURL(url)) {
      canInject = promisify(isAllowedFileSchemeAccess)();
    } else {
      canInject = Promise.resolve(false);
    }
    return canInject;
  }

  /**
   * Guess the content type of a page from the URL alone.
   *
   * This is a fallback for when it is not possible to inject
   * a content script to determine the type of content in the page.
   *
   * @param {string} url
   */
  function guessContentTypeFromURL(url) {
    if (url.includes('.pdf')) {
      return CONTENT_TYPE_PDF;
    } else {
      return CONTENT_TYPE_HTML;
    }
  }

  /** @param {Tab} tab */
  function detectTabContentType(tab) {
    if (isPDFViewerURL(tab.url)) {
      return Promise.resolve(CONTENT_TYPE_PDF);
    }

    return canInjectScript(tab.url).then(function (canInject) {
      if (canInject) {
        return executeScript(tab.id, {
          code: toIIFEString(detectContentType),
        }).then(function (frameResults) {
          const result = extractContentScriptResult(frameResults);
          if (result) {
            return result.type;
          } else {
            // If the content script threw an exception,
            // frameResults may be null or undefined.
            //
            // In that case, fall back to guessing based on the
            // tab URL
            return guessContentTypeFromURL(tab.url);
          }
        });
      } else {
        // We cannot inject a content script in order to determine the
        // file type, so fall back to a URL-based mechanism
        return Promise.resolve(guessContentTypeFromURL(tab.url));
      }
    });
  }

  /**
   * Returns true if a tab is displaying a PDF using the PDF.js-based
   * viewer bundled with the extension.
   *
   * @param {string} url
   */
  function isPDFViewerURL(url) {
    return url.startsWith(pdfViewerBaseURL);
  }

  /** @param {string} url */
  function isFileURL(url) {
    return url.startsWith('file:');
  }

  /** @param {string} url */
  function isSupportedURL(url) {
    // Injection of content scripts is limited to a small number of protocols,
    // see https://developer.chrome.com/extensions/match_patterns
    const parsedURL = new URL(url);
    return ['http:', 'https:', 'ftp:'].includes(parsedURL.protocol);
  }

  /** @param {Tab} tab */
  function injectIntoLocalDocument(tab) {
    return detectTabContentType(tab).then(function (type) {
      if (type === CONTENT_TYPE_PDF) {
        return injectIntoLocalPDF(tab);
      } else {
        return Promise.reject(
          new LocalFileError('Local non-PDF files are not supported')
        );
      }
    });
  }

  /**
   * @param {Tab} tab
   * @param {object} config
   */
  async function injectIntoRemoteDocument(tab, config) {
    if (isPDFViewerURL(tab.url)) {
      return;
    }

    if (!isSupportedURL(tab.url)) {
      // Chrome does not permit extensions to inject content scripts
      // into (chrome*):// URLs and other custom schemes.
      //
      // A common case where this happens is when the user has an
      // extension installed that provides a custom viewer for PDFs
      // (or some other format). In some cases we could extract the original
      // URL and open that in the Hypothesis viewer instead.
      const protocol = tab.url.split(':')[0];
      throw new RestrictedProtocolError(
        'Cannot load Hypothesis into ' + protocol + ' pages'
      );
    }

    const type = await detectTabContentType(tab);

    if (type === CONTENT_TYPE_PDF) {
      await injectIntoPDF(tab);
    } else {
      await injectConfig(tab.id, config);
      const results = await injectIntoHTML(tab);
      const result = extractContentScriptResult(results);
      if (
        typeof result?.installedURL === 'string' &&
        !result.installedURL.includes(extensionURL('/'))
      ) {
        throw new AlreadyInjectedError(
          'Hypothesis is already injected into this page'
        );
      }
    }
  }

  /** @param {Tab} tab */
  function injectIntoPDF(tab) {
    if (isPDFViewerURL(tab.url)) {
      return Promise.resolve();
    }
    const update = promisify(chromeTabs.update);
    return update(tab.id, { url: getPDFViewerURL(tab.url) });
  }

  /** @param {Tab} tab */
  function injectIntoLocalPDF(tab) {
    return new Promise(function (resolve, reject) {
      isAllowedFileSchemeAccess(function (isAllowed) {
        if (isAllowed) {
          resolve(injectIntoPDF(tab));
        } else {
          reject(new NoFileAccessError('Local file scheme access denied'));
        }
      });
    });
  }

  /** @param {Tab} tab */
  function injectIntoHTML(tab) {
    return executeScript(tab.id, { file: '/client/build/boot.js' });
  }

  /** @param {Tab} tab */
  function removeFromPDF(tab) {
    return new Promise(function (resolve) {
      const parsedURL = new URL(tab.url);
      const originalURL = parsedURL.searchParams.get('file');
      if (!originalURL) {
        throw new Error('Failed to extract original URL from ' + tab.url);
      }
      let hash = parsedURL.hash;

      // If the original URL was a direct link, drop the #annotations fragment
      // as otherwise the Chrome extension will re-activate itself on this tab
      // when the original URL loads.
      if (hash.startsWith('#annotations:')) {
        hash = '';
      }

      chromeTabs.update(
        tab.id,
        {
          url: decodeURIComponent(originalURL) + hash,
        },
        resolve
      );
    });
  }

  /** @param {Tab} tab */
  function removeFromHTML(tab) {
    if (!isSupportedURL(tab.url)) {
      return Promise.resolve();
    }
    return executeScript(tab.id, { file: '/unload-client.js' });
  }

  /**
   * Inject configuration information for the Hypothesis application
   * into the page as JSON data via a <meta> tag.
   *
   * A <meta> tag is used because that makes it available to JS content
   * running in isolated worlds.
   *
   * @param {number} tabId
   * @param {object} config
   */
  function injectConfig(tabId, config) {
    const configStr = JSON.stringify(config).replace(/"/g, '\\"');
    const configCode = `var hypothesisConfig="${configStr}";\n(${addJSONScriptTag})("js-hypothesis-config", hypothesisConfig);\n`;
    return executeScript(tabId, { code: configCode });
  }
}
