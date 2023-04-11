import { chromeAPI, executeFunction, executeScript } from './chrome-api';
import { detectContentType } from './detect-content-type';
import {
  AlreadyInjectedError,
  BlockedSiteError,
  LocalFileError,
  NoFileAccessError,
  RestrictedProtocolError,
} from './errors';

const CONTENT_TYPE_HTML = 'HTML';
const CONTENT_TYPE_PDF = 'PDF';
const CONTENT_TYPE_VITALSOURCE = 'VITALSOURCE';
const CONTENT_TYPE_LMS = 'LMS';

/**
 * @param {object} config
 */
/* istanbul ignore next - Code coverage breaks `eval`-ing of this function in tests. */
function setClientConfig(config) {
  const script = document.createElement('script');
  script.className = 'js-hypothesis-config';
  script.type = 'application/json';
  script.textContent = JSON.stringify(config);
  // This ensures the client removes the script when the extension is deactivated
  script.setAttribute('data-remove-on-unload', '');
  document.head.appendChild(script);
}

/**
 * Function that is run in a frame to test whether the Hypothesis client is
 * active there.
 *
 * @param {string} extensionURL - Root URL for the extension, of the form
 *   "chrome-extension://{ID}/".
 */
function isClientActive(extensionURL) {
  const annotatorLink = /** @type {HTMLLinkElement|null} */ (
    document.querySelector('link[type="application/annotator+html"]')
  );
  return annotatorLink?.href.startsWith(extensionURL) ?? false;
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
 */
export function SidebarInjector() {
  const pdfViewerBaseURL = chromeAPI.runtime.getURL('/pdfjs/web/viewer.html');

  /**
   * Check for the presence of the client in a browser tab.
   *
   * If code cannot be run in this tab to check the state of the client, it is
   * assumed to not be active.
   *
   * @param {chrome.tabs.Tab} tab
   * @return {Promise<boolean>}
   */
  this.isClientActiveInTab = async tab => {
    const tab_ = checkTab(tab);

    // If this is our PDF viewer, the client is definitely active.
    if (isPDFViewerURL(tab_.url)) {
      return true;
    }

    // In the VitalSource book reader, we need to test a specific frame.
    let frameId;
    if (isVitalSourceURL(tab_.url)) {
      const vsFrame = await getVitalSourceViewerFrame(tab_, {
        // If we don't have permissions to query frames in the page, make this
        // call fail and we'll return false.
        requestPermissions: false,
      });
      if (vsFrame) {
        frameId = vsFrame.frameId;
      }
    }

    try {
      const extensionURL = chromeAPI.runtime.getURL('/');
      const isActive = await executeFunction({
        tabId: tab_.id,
        frameId,
        func: isClientActive,
        args: [extensionURL],
      });
      return isActive;
    } catch {
      // We failed to run code in this tab, eg. because it is a URL that
      // disallows extension scripting or it is being unloaded.
      return false;
    }
  };

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
    } else if (isVitalSourceURL(tab_.url)) {
      return removeFromVitalSource(tab_);
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
  async function canInjectScript(url) {
    if (isSupportedURL(url)) {
      return true;
    } else if (isFileURL(url)) {
      return chromeAPI.extension.isAllowedFileSchemeAccess();
    } else {
      return false;
    }
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

  /** @param {string} url */
  function isVitalSourceURL(url) {
    return url.startsWith('https://bookshelf.vitalsource.com/');
  }

  /** @param {string} url */
  function isLMSAssignmentURL(url) {
    const { origin } = new URL(url);
    // Matches origins like `lms.hypothes.is`, `qa-lms.hypothes.is`, `lms.ca.hypothes.is`.
    return /\blms\b/.test(origin) && origin.endsWith('.hypothes.is');
  }

  /** @param {Tab} tab */
  async function detectTabContentType(tab) {
    if (isPDFViewerURL(tab.url)) {
      return CONTENT_TYPE_PDF;
    }

    if (isVitalSourceURL(tab.url)) {
      return CONTENT_TYPE_VITALSOURCE;
    }

    if (isLMSAssignmentURL(tab.url)) {
      return CONTENT_TYPE_LMS;
    }

    const canInject = await canInjectScript(tab.url);
    if (canInject) {
      const result = await executeFunction({
        tabId: tab.id,
        func: detectContentType,
        args: [],
      });
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
    } else {
      // We cannot inject a content script in order to determine the
      // file type, so fall back to a URL-based mechanism
      return guessContentTypeFromURL(tab.url);
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

  /** @param {Tab} tab */
  async function injectIntoLocalDocument(tab) {
    const type = await detectTabContentType(tab);
    if (type === CONTENT_TYPE_PDF) {
      return injectIntoLocalPDF(tab);
    } else {
      throw new LocalFileError('Local non-PDF files are not supported');
    }
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
    } else if (type === CONTENT_TYPE_VITALSOURCE) {
      await injectIntoVitalSourceReader(tab, config);
    } else if (type === CONTENT_TYPE_LMS) {
      // The extension is blocked on LMS assignments to avoid confusion with the
      // embedded Hypothesis instance. The user can still use the extension on other
      // pages hosted in the LMS itself.
      throw new BlockedSiteError(
        "Hypothesis extension can't be used on Hypothesis LMS assignments"
      );
    } else {
      const result = /** @type {{ installedURL: string }|null} */ (
        await injectIntoHTML(tab, config)
      );
      if (
        typeof result?.installedURL === 'string' &&
        !result.installedURL.includes(chromeAPI.runtime.getURL('/'))
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
    return chromeAPI.tabs.update(tab.id, { url: getPDFViewerURL(tab.url) });
  }

  /** @param {Tab} tab */
  async function injectIntoLocalPDF(tab) {
    const isAllowed = await chromeAPI.extension.isAllowedFileSchemeAccess();
    if (isAllowed) {
      await injectIntoPDF(tab);
    } else {
      throw new NoFileAccessError('Local file scheme access denied');
    }
  }

  /**
   * @param {Tab} tab
   * @param {object} config
   */
  async function injectIntoHTML(tab, config) {
    await injectConfig(tab.id, config);
    return executeClientBootScript(tab.id);
  }

  /** @param {Tab} tab */
  async function removeFromPDF(tab) {
    const parsedURL = new URL(tab.url);
    const originalURL = parsedURL.searchParams.get('file');
    if (!originalURL) {
      throw new Error(`Failed to extract original URL from ${tab.url}`);
    }
    let hash = parsedURL.hash;

    // If the original URL was a direct link, drop the #annotations fragment
    // as otherwise the Chrome extension will re-activate itself on this tab
    // when the original URL loads.
    if (hash.startsWith('#annotations:')) {
      hash = '';
    }

    await chromeAPI.tabs.update(tab.id, {
      url: decodeURIComponent(originalURL) + hash,
    });
  }

  /** @param {Tab} tab */
  function removeFromHTML(tab) {
    if (!isSupportedURL(tab.url)) {
      return Promise.resolve();
    }
    return executeScript({
      tabId: tab.id,
      file: '/unload-client.js',
    });
  }

  /**
   * Find the frame within the VitalSource Bookshelf reader into which the
   * Hypothesis client should be loaded.
   *
   * The frame hierarchy will look like:
   *
   * bookshelf.vitalsource.com (Main frame)
   * |- jigsaw.vitalsource.com (Ebook reader. This is where we want to inject the client)
   *     |- jigsaw.vitalsource.com (Content of current chapter)
   *
   * @param {Tab} tab
   * @param {object} options
   *   @param {boolean} [options.requestPermissions] - Whether to request the `webNavigation`
   *     permission from the user to query frames, if not already granted.
   * @return {Promise<chrome.webNavigation.GetAllFrameResultDetails|undefined>}
   */
  async function getVitalSourceViewerFrame(
    tab,
    { requestPermissions = true } = {}
  ) {
    // Using `chrome.webNavigation.getAllFrames` requires asking for the
    // `webNavigation` permission which results in a scary prompt about reading
    // browser history, even though we only want to get frames for the current
    // tab :(
    //
    // We check for the permission using `getAll` first, because `request` will
    // trigger an error if called outside of a user gesture, even if we do have
    // the permission. When the user initially activates the client in VS, this
    // function will be called within a user gesture. Subsequent automatic
    // activations (eg. after navigation) may happen outside of a user gesture
    // however.
    let canUseWebNavigation = (
      await chromeAPI.permissions.getAll()
    ).permissions?.includes('webNavigation');
    if (!canUseWebNavigation && requestPermissions) {
      canUseWebNavigation = await chromeAPI.permissions.request({
        permissions: ['webNavigation'],
      });
    }
    if (!canUseWebNavigation) {
      throw new Error('The extension was not granted required permissions');
    }

    const frames = await chromeAPI.webNavigation.getAllFrames({
      tabId: tab.id,
    });
    if (!frames) {
      throw new Error('Could not list frames in tab');
    }

    return frames.find(frame => {
      const frameURL = new URL(frame.url);
      if (
        frameURL.hostname !== 'jigsaw.vitalsource.com' ||
        !frameURL.pathname.startsWith('/mosaic/wrapper.html')
      ) {
        return null;
      }

      return frame;
    });
  }

  /**
   * @param {Tab} tab
   * @param {object} config
   */
  async function injectIntoVitalSourceReader(tab, config) {
    const frame = await getVitalSourceViewerFrame(tab);
    if (!frame) {
      throw new Error('Book viewer frame not found');
    }
    await injectConfig(tab.id, config, frame.frameId);
    await executeClientBootScript(tab.id, frame.frameId);
  }

  /** @param {Tab} tab */
  async function removeFromVitalSource(tab) {
    const frame = await getVitalSourceViewerFrame(tab);
    if (!frame) {
      return;
    }
    await executeScript({
      tabId: tab.id,
      frameId: frame.frameId,
      file: '/unload-client.js',
    });
  }

  /**
   * Inject configuration for the Hypothesis client into the page via a
   * JSON <script> tag.
   *
   * @param {number} tabId
   * @param {object} clientConfig
   * @param {number} [frameId]
   */
  function injectConfig(tabId, clientConfig, frameId) {
    return executeFunction({
      tabId,
      frameId,
      func: setClientConfig,
      args: [clientConfig],
    });
  }

  /**
   * @param {number} tabId
   * @param {number} [frameId]
   */
  async function executeClientBootScript(tabId, frameId) {
    return executeScript({
      tabId,
      frameId,
      file: '/client/build/boot.js',
    });
  }
}
