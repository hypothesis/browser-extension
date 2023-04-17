import { chromeAPI } from './chrome-api';
import {
  BlockedSiteError,
  LocalFileError,
  NoFileAccessError,
  RestrictedProtocolError,
} from './errors';

/**
 * A controller for displaying help pages. These are bound to extension
 * specific errors (found in errors.js) but can also be triggered manually.
 */
export class HelpPage {
  /**
   * Accepts an instance of errors.ExtensionError and displays an appropriate
   * help page if one exists.
   *
   * @param tab - The tab where the error occurred
   * @param error - The error to display, usually an instance of {@link ExtensionError}
   */
  showHelpForError(tab: chrome.tabs.Tab, error: Error) {
    let section;
    if (error instanceof LocalFileError) {
      section = 'local-file';
    } else if (error instanceof NoFileAccessError) {
      section = 'no-file-access';
    } else if (error instanceof RestrictedProtocolError) {
      section = 'restricted-protocol';
    } else if (error instanceof BlockedSiteError) {
      section = 'blocked-site';
    } else {
      section = 'other-error';
    }

    const url = new URL(chromeAPI.runtime.getURL('/help/index.html'));
    if (error) {
      url.searchParams.append('message', error.message);
    }
    url.hash = section;

    chromeAPI.tabs.create({
      index: tab.index + 1,
      url: url.toString(),
      openerTabId: tab.id,
    });
  }
}
