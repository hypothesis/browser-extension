import settings from './settings';

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

// themes to apply to the toolbar icon badge depending on the type of
// build. Production builds use the default color and no text
const badgeThemes = {
  dev: {
    defaultText: 'DEV',
    color: '#5BCF59', // Emerald green
  },
  qa: {
    defaultText: 'QA',
    color: '#EDA061', // Porche orange-pink
  },
};

// Fake localization function.
function _(str) {
  return str;
}

/**
 * Controls the display of the browser action button setting the icon, title
 * and badges depending on the current state of the tab.
 *
 * BrowserAction is responsible for mapping the logical H state of
 * a tab (whether the extension is active, annotation count) to
 * the badge state.
 *
 * @param {chrome.browserAction} chromeBrowserAction
 */
export default function BrowserAction(chromeBrowserAction) {
  const buildType = settings.buildType;

  /**
   * Updates the state of the browser action to reflect the logical
   * H state of a tab.
   *
   * @param state - The H state of a tab. See the 'tab-state' module.
   */
  this.update = function (tabId, state) {
    let activeIcon = icons.inactive;
    let title = '';
    let badgeText = '';

    if (state.state === 'active') {
      activeIcon = icons.active;
      title = 'Hypothesis is active';
    } else if (state.state === 'inactive') {
      title = 'Hypothesis is inactive';
    } else if (state.state === 'errored') {
      title = 'Hypothesis failed to load';
      badgeText = '!';
    } else {
      throw new Error('Unknown tab state');
    }

    // display the annotation count on the badge
    if (state.state !== 'errored' && state.annotationCount) {
      let countLabel;
      let totalString = state.annotationCount.toString();
      if (state.annotationCount > 999) {
        totalString = '999+';
      }
      if (state.annotationCount === 1) {
        countLabel = _("There's 1 annotation on this page");
      } else {
        countLabel = _(
          'There are ' + totalString + ' annotations on this page'
        );
      }
      title = countLabel;
      badgeText = totalString;
    }

    // update the badge style to reflect the build type
    const badgeTheme = badgeThemes[buildType];
    if (badgeTheme) {
      chromeBrowserAction.setBadgeBackgroundColor({
        tabId: tabId,
        color: badgeTheme.color,
      });
      if (!badgeText) {
        badgeText = badgeTheme.defaultText;
      }
    }

    chromeBrowserAction.setBadgeText({ tabId: tabId, text: badgeText });
    chromeBrowserAction.setIcon({ tabId: tabId, path: activeIcon });
    chromeBrowserAction.setTitle({ tabId: tabId, title: title });
  };
}

BrowserAction.icons = icons;
