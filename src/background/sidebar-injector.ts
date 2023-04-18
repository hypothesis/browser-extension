import {
  chromeAPI,
  executeFunction,
  executeScript,
  getExtensionId,
} from './chrome-api';
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

/* istanbul ignore next - Code coverage breaks `eval`-ing of this function in tests. */
function setClientConfig(config: object, extensionId: string) {
  const script = document.createElement('script');
  script.className = 'js-hypothesis-config';
  script.type = 'application/json';
  script.textContent = JSON.stringify(config);
  script.setAttribute('data-extension-id', extensionId);
  // This ensures the client removes the script when the extension is deactivated
  script.setAttribute('data-remove-on-unload', '');
  document.head.appendChild(script);
}

/**
 * Function that is run in a frame to test whether the Hypothesis client is
 * active there.
 *
 * @param extensionURL - Root URL for the extension, of the form
 *   "chrome-extension://{ID}/".
 */
function isClientActive(extensionURL: string) {
  const annotatorLink = document.querySelector(
    'link[type="application/annotator+html"]'
  ) as HTMLLinkElement | null;
  return annotatorLink?.href.startsWith(extensionURL) ?? false;
}

/**
 * A Chrome tab for which we have ID and URL information.
 *
 * This type avoids the need to check everywhere we access these properties.
 */
type Tab = chrome.tabs.Tab & { id: number; url: string };

/**
 * Check that a tab has the necessary metadata to inject or un-inject the client.
 *
 * All "normal" tabs should have this information because of the extension's
 * permissions.
 */
function checkTab(tab: chrome.tabs.Tab): Tab {
  if (!tab.id || !tab.url) {
    throw new Error('Tab is missing ID or URL');
  }
  return tab as Tab;
}

/**
 * The SidebarInjector is used to deploy and remove the Hypothesis sidebar
 * from tabs. It also deals with loading PDF documents into the PDF.js viewer
 * when applicable.
 */
export class SidebarInjector {
  isClientActiveInTab: (tab: chrome.tabs.Tab) => Promise<boolean>;
  injectIntoTab: (tab: chrome.tabs.Tab, config: object) => Promise<void>;
  removeFromTab: (tab: chrome.tabs.Tab) => Promise<void>;
  requestExtraPermissionsForTab: (tab: chrome.tabs.Tab) => Promise<boolean>;

  constructor() {
    const pdfViewerBaseURL = chromeAPI.runtime.getURL('/pdfjs/web/viewer.html');

    /**
     * Check for the presence of the client in a browser tab.
     *
     * If code cannot be run in this tab to check the state of the client, it is
     * assumed to not be active.
     */
    this.isClientActiveInTab = async (tab: chrome.tabs.Tab) => {
      const tab_ = checkTab(tab);

      // If this is our PDF viewer, the client is definitely active.
      if (isPDFViewerURL(tab_.url)) {
        return true;
      }

      // In the VitalSource book reader, we need to test a specific frame.
      let frameId;
      if (isVitalSourceURL(tab_.url)) {
        const vsFrame = await getVitalSourceViewerFrame(tab_);
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
     * Certain URLs (eg. VitalSource books) may require extra permissions to
     * inject. These must be obtained by calling {@link requestExtraPermissionsForTab},
     * directly after the user clicks the extension's toolbar icon, before calling
     * this method.
     *
     * @param tab - A tab object representing the tab to insert the sidebar into.
     * @param config - An object containing configuration info that is passed to
     *   the app when it loads.
     *
     * Returns a promise that will be resolved if the injection succeeded
     * otherwise it will be rejected with an error.
     */
    this.injectIntoTab = (tab: chrome.tabs.Tab, config: object = {}) => {
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
     */
    this.removeFromTab = (tab: chrome.tabs.Tab) => {
      const tab_ = checkTab(tab);
      if (isPDFViewerURL(tab_.url)) {
        return removeFromPDF(tab_);
      } else if (isVitalSourceURL(tab_.url)) {
        return removeFromVitalSource(tab_);
      } else {
        return removeFromHTML(tab_);
      }
    };

    /**
     * Request additional permissions that are required to inject Hypothesis
     * into a given tab.
     *
     * Ideally the permissions request would just be part of {@link injectIntoTab}
     * however it needs to be performed immediately after the user clicks the
     * extension's toolbar icon, before any async calls, otherwise it will fail
     * due to lack of a user gesture. See https://bugs.chromium.org/p/chromium/issues/detail?id=1363490.
     */
    this.requestExtraPermissionsForTab = async (tab: chrome.tabs.Tab) => {
      const tab_ = checkTab(tab);
      if (isVitalSourceURL(tab_.url)) {
        return await chromeAPI.permissions.request({
          permissions: ['webNavigation'],
        });
      } else {
        // No extra permissions needed for other tabs.
        return true;
      }
    };

    function getPDFViewerURL(url: string) {
      // Encode the original URL but preserve the fragment, so that a
      // '#annotations' fragment in the original URL will persist and trigger the
      // sidebar to focus and scroll to that annotation when the PDF viewer loads.
      const parsedURL = new URL(url);
      const hash = parsedURL.hash;
      parsedURL.hash = '';
      const encodedURL = encodeURIComponent(parsedURL.href);
      return `${pdfViewerBaseURL}?file=${encodedURL}${hash}`;
    }

    /**
     * Returns true if the extension is permitted to inject a content script into
     * a tab with a given URL.
     */
    async function canInjectScript(url: string) {
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
     */
    function guessContentTypeFromURL(url: string) {
      if (url.includes('.pdf')) {
        return CONTENT_TYPE_PDF;
      } else {
        return CONTENT_TYPE_HTML;
      }
    }

    function isVitalSourceURL(url: string) {
      return url.startsWith('https://bookshelf.vitalsource.com/');
    }

    function isLMSAssignmentURL(url: string) {
      const { origin } = new URL(url);
      // Matches origins like `lms.hypothes.is`, `qa-lms.hypothes.is`, `lms.ca.hypothes.is`.
      return /\blms\b/.test(origin) && origin.endsWith('.hypothes.is');
    }

    async function detectTabContentType(tab: Tab) {
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
     */
    function isPDFViewerURL(url: string) {
      return url.startsWith(pdfViewerBaseURL);
    }

    function isFileURL(url: string) {
      return url.startsWith('file:');
    }

    function isSupportedURL(url: string) {
      // Injection of content scripts is limited to a small number of protocols,
      // see https://developer.chrome.com/extensions/match_patterns
      const parsedURL = new URL(url);
      return ['http:', 'https:', 'ftp:'].includes(parsedURL.protocol);
    }

    async function injectIntoLocalDocument(tab: Tab) {
      const type = await detectTabContentType(tab);
      if (type === CONTENT_TYPE_PDF) {
        return injectIntoLocalPDF(tab);
      } else {
        throw new LocalFileError('Local non-PDF files are not supported');
      }
    }

    async function injectIntoRemoteDocument(tab: Tab, config: object) {
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
          `Cannot load Hypothesis into ${protocol} pages`
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
        // FIXME - Nothing actually sets `installedURL`. It used to be part of
        // the client's boot script. See e0bf3fd2a09414170eb991d7837bf6acd821502b.
        const result = (await injectIntoHTML(tab, config)) as {
          installedURL: string;
        } | null;
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

    function injectIntoPDF(tab: Tab) {
      if (isPDFViewerURL(tab.url)) {
        return Promise.resolve();
      }
      return chromeAPI.tabs.update(tab.id, { url: getPDFViewerURL(tab.url) });
    }

    async function injectIntoLocalPDF(tab: Tab) {
      const isAllowed = await chromeAPI.extension.isAllowedFileSchemeAccess();
      if (isAllowed) {
        await injectIntoPDF(tab);
      } else {
        throw new NoFileAccessError('Local file scheme access denied');
      }
    }

    async function injectIntoHTML(tab: Tab, config: object) {
      await injectConfig(tab.id, config);
      return executeClientBootScript(tab.id);
    }

    async function removeFromPDF(tab: Tab) {
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

    async function removeFromHTML(tab: Tab) {
      if (!isSupportedURL(tab.url)) {
        return;
      }
      await executeScript({
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
     */
    async function getVitalSourceViewerFrame(
      tab: Tab
    ): Promise<chrome.webNavigation.GetAllFrameResultDetails | undefined> {
      // Using `chrome.webNavigation.getAllFrames` requires asking for the
      // `webNavigation` permission which results in a scary prompt about reading
      // browser history, even though we only want to get frames for the current
      // tab :(
      //
      // The request for permissions must happen immediately after clicking
      // the browser action, to avoid an error about it happening outside a user
      // gesture [1]. This is done by calling `requestExtraPermissionsForTab`
      // before `injectIntoTab`.
      //
      // [1] https://bugs.chromium.org/p/chromium/issues/detail?id=1363490
      const canUseWebNavigation = (
        await chromeAPI.permissions.getAll()
      ).permissions?.includes('webNavigation');
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

    async function injectIntoVitalSourceReader(tab: Tab, config: object) {
      const frame = await getVitalSourceViewerFrame(tab);
      if (!frame) {
        throw new Error('Book viewer frame not found');
      }
      await injectConfig(tab.id, config, frame.frameId);
      await executeClientBootScript(tab.id, frame.frameId);
    }

    async function removeFromVitalSource(tab: Tab) {
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
     */
    function injectConfig(
      tabId: number,
      clientConfig: object,
      frameId?: number
    ) {
      const extensionId = getExtensionId();
      return executeFunction({
        tabId,
        frameId,
        func: setClientConfig,
        args: [clientConfig, extensionId],
      });
    }

    async function executeClientBootScript(tabId: number, frameId?: number) {
      return executeScript({
        tabId,
        frameId,
        file: '/client/build/boot.js',
      });
    }
  }
}
