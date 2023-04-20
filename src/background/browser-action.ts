import { chromeAPI } from './chrome-api';
import settings from './settings';

import type { State as TabState } from './tab-state';

// Each button state has two icons one for normal resolution (19) and one
// for hi-res screens (38).
const icons = {
  active: {
    19: 'images/browser-icon-active.png',
    38: 'images/browser-icon-active@2x.png',
  },
  inactive: {
    19: 'images/browser-icon-inactive.png',
    38: 'images/browser-icon-inactive@2x.png',
  },
};

/**
 * Themes to apply to the toolbar icon badge depending on the type of
 * build. Production builds use the default color and no text
 */
const badgeThemes: Record<string, { defaultText: string; color: string }> = {
  dev: {
    defaultText: 'DEV',
    color: '#5BCF59', // Emerald green
  },
  qa: {
    defaultText: 'QA',
    color: '#EDA061', // Porche orange-pink
  },
};

/**
 * Controls the display of the browser action button setting the icon, title
 * and badges depending on the current state of the tab.
 *
 * BrowserAction is responsible for mapping the logical H state of
 * a tab (whether the extension is active, annotation count) to
 * the badge state.
 */
export class BrowserAction {
  /**
   * Updates the state of the browser action to reflect the logical
   * H state of a tab.
   */
  update(tabId: number, state: TabState) {
    let activeIcon;
    let title;
    let badgeText = '';

    switch (state.state) {
      case 'active':
        activeIcon = icons.active;
        title = 'Hypothesis is active';
        break;
      case 'inactive':
        activeIcon = icons.inactive;
        title = 'Hypothesis is inactive';
        break;
      case 'errored':
        activeIcon = icons.inactive;
        title = 'Hypothesis failed to load';
        badgeText = '!';
        break;
    }

    // display the annotation count on the badge
    if (state.state !== 'errored' && state.annotationCount) {
      let totalString = state.annotationCount.toString();
      if (state.annotationCount > 999) {
        totalString = '999+';
      }

      let countLabel;
      if (state.annotationCount === 1) {
        countLabel = "There's 1 annotation on this page";
      } else {
        countLabel = `There are ${totalString} annotations on this page`;
      }

      title = countLabel;
      badgeText = totalString;
    }

    // update the badge style to reflect the build type
    const badgeTheme = badgeThemes[settings.buildType];
    if (badgeTheme) {
      chromeAPI.browserAction.setBadgeBackgroundColor({
        tabId,
        color: badgeTheme.color,
      });
      if (!badgeText) {
        badgeText = badgeTheme.defaultText;
      }
    }

    chromeAPI.browserAction.setBadgeText({ tabId, text: badgeText });
    chromeAPI.browserAction.setIcon({ tabId, path: activeIcon });
    chromeAPI.browserAction.setTitle({ tabId, title });
  }

  static icons = icons;
}
