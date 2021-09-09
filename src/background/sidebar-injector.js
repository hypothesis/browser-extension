import detectContentType from './detect-content-type';
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
 * SidebarInjector is used to deploy and remove the Hypothesis sidebar
 * from tabs. It also handles loading PDF documents into the PDF.js viewer.
 */
export default class SidebarInjector {
  /**
   * @param {chrome.tabs} chromeTabs
   * @param {object} services
   *   @param {(cb: (allowed: boolean) => void) => void} services.isAllowedFileSchemeAccess -
   *     A function that returns true if the user
   *     can access resources over the file:// protocol. See:
   *     https://developer.chrome.com/extensions/extension#method-isAllowedFileSchemeAccess
   *   @param {(path: string) => string} services.extensionURL -
   *     A function that receives a path and returns an absolute
   *     url. See: https://developer.chrome.com/extensions/extension#method-getURL
   */
  constructor(chromeTabs, { isAllowedFileSchemeAccess, extensionURL }) {
    const executeScript = promisify(chromeTabs.executeScript);

    const pdfViewerBaseURL = extensionURL('/pdfjs/web/viewer.html');

    /**
     * Injects the Hypothesis sidebar into the tab provided.
     *
     * @param {chrome.tabs.Tab} tab - A tab object representing the tab to insert the sidebar
     *        into.
     * @param {object} config - An object containing configuration info that
     *        is passed to the app when it loads.
     * @return {Promise<void>}
     */
    this.injectIntoTab = function (tab, config) {
      config = config || {};
      if (isFileURL(/** @type {string} */ (tab.url))) {
        return injectIntoLocalDocument(tab);
      } else {
        return injectIntoRemoteDocument(tab, config);
      }
    };

    /* Removes the Hypothesis sidebar from the tab provided.
     *
     * @param {chrome.tabs.Tab} tab - Tab to remove the sidebar from.
     * @return {Promise<void>}
     */
    this.removeFromTab = function (tab) {
      if (isPDFViewerURL(tab.url)) {
        return removeFromPDF(tab);
      } else {
        return removeFromHTML(tab);
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
     * Returns true if the extension is permitted to inject
     * a content script into a tab with a given URL.
     *
     * @param {string} url
     */
    async function canInjectScript(url) {
      let canInject;
      if (isSupportedURL(url)) {
        canInject = true;
      } else if (isFileURL(url)) {
        canInject = await promisify(isAllowedFileSchemeAccess)();
      } else {
        canInject = false;
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

    /**
     * @param {chrome.tabs.Tab} tab
     * @return {Promise<'HTML'|'PDF'>}
     */
    async function detectTabContentType(tab) {
      const url = /** @type {string} */ (tab.url);
      if (isPDFViewerURL(url)) {
        return CONTENT_TYPE_PDF;
      }

      const canInject = await canInjectScript(url);
      if (canInject) {
        const frameResults = await executeScript(
          /** @type {number} */ (tab.id),
          {
            code: toIIFEString(detectContentType),
          }
        );
        const result = extractContentScriptResult(frameResults);
        if (result) {
          return result.type;
        } else {
          // If the content script threw an exception,
          // frameResults may be null or undefined.
          //
          // In that case, fall back to guessing based on the
          // tab URL
          return guessContentTypeFromURL(url);
        }
      } else {
        // We cannot inject a content script in order to determine the
        // file type, so fall back to a URL-based mechanism
        return guessContentTypeFromURL(url);
      }
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

    /** @param {chrome.tabs.Tab} tab */
    async function injectIntoLocalDocument(tab) {
      const type = await detectTabContentType(tab);
      if (type === CONTENT_TYPE_PDF) {
        return injectIntoLocalPDF(tab);
      } else {
        throw new LocalFileError('Local non-PDF files are not supported');
      }
    }

    /**
     * @param {chrome.tabs.Tab} tab
     * @param {object} config
     */
    async function injectIntoRemoteDocument(tab, config) {
      const url = /** @type {string} */ (tab.url);
      if (isPDFViewerURL(url)) {
        return;
      }

      if (!isSupportedURL(url)) {
        // Chrome does not permit extensions to inject content scripts
        // into (chrome*):// URLs and other custom schemes.
        //
        // A common case where this happens is when the user has an
        // extension installed that provides a custom viewer for PDFs
        // (or some other format). In some cases we could extract the original
        // URL and open that in the Hypothesis viewer instead.
        const protocol = url.split(':')[0];
        throw new RestrictedProtocolError(
          `Cannot load Hypothesis into ${protocol} pages`
        );
      }

      const type = await detectTabContentType(tab);
      if (type === CONTENT_TYPE_PDF) {
        await injectIntoPDF(tab);
      } else {
        await injectConfig(/** @type {number} */ (tab.id), config);
        const results = await injectIntoHTML(tab);
        const result = extractContentScriptResult(results);
        if (
          result &&
          typeof result.installedURL === 'string' &&
          !result.installedURL.includes(extensionURL('/'))
        ) {
          throw new AlreadyInjectedError(
            'Hypothesis is already injected into this page'
          );
        }
      }
    }

    /** @param {chrome.tabs.Tab} tab */
    function injectIntoPDF(tab) {
      const url = /** @type {string} */ (tab.url);
      if (isPDFViewerURL(url)) {
        return Promise.resolve();
      }
      const update = promisify(chromeTabs.update);
      return update(/** @type {number} */ (tab.id), {
        url: getPDFViewerURL(url),
      });
    }

    /** @param {chrome.tabs.Tab} tab */
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

    /** @param {chrome.tabs.Tab} tab */
    function injectIntoHTML(tab) {
      return injectScript(
        /** @type {number} */ (tab.id),
        '/client/build/boot.js'
      );
    }

    /** @param {chrome.tabs.Tab} tab */
    function removeFromPDF(tab) {
      return new Promise(function (resolve) {
        const parsedURL = new URL(/** @type {string} */ (tab.url));
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
          /** @type {number} */ (tab.id),
          {
            url: decodeURIComponent(originalURL) + hash,
          },
          resolve
        );
      });
    }

    /** @param {chrome.tabs.Tab} tab */
    function removeFromHTML(tab) {
      if (!isSupportedURL(/** @type {string} */ (tab.url))) {
        return Promise.resolve();
      }
      return injectScript(/** @type {number} */ (tab.id), '/unload-client.js');
    }

    /**
     * Inject the script from the source file at `path` into the
     * page currently loaded in the tab at the given ID.
     *
     * @param {number} tabId
     * @param {string} path
     */
    function injectScript(tabId, path) {
      return executeScript(tabId, { file: path });
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
}
