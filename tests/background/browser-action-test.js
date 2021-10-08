import { BrowserAction, $imports } from '../../src/background/browser-action';

describe('BrowserAction', function () {
  let action;
  let fakeChromeBrowserAction;

  beforeEach(function () {
    fakeChromeBrowserAction = {
      annotationCount: 0,
      title: '',
      badgeText: '',
      badgeColor: '',

      setIcon: function (options) {
        this.icon = options.path;
      },
      setTitle: function (options) {
        this.title = options.title;
      },
      setBadgeText: function (options) {
        this.badgeText = options.text;
      },
      setBadgeBackgroundColor: function (options) {
        this.badgeColor = options.color;
      },
    };

    const chromeAPI = { browserAction: fakeChromeBrowserAction };

    $imports.$mock({
      './chrome-api': { chromeAPI },
    });
    action = new BrowserAction(fakeChromeBrowserAction);
  });

  afterEach(() => {
    $imports.$restore();
  });

  describe('active state', function () {
    it('sets the active browser icon', function () {
      action.update(1, { state: 'active' });
      assert.equal(fakeChromeBrowserAction.icon, BrowserAction.icons.active);
    });

    it('sets the title of the browser icon', function () {
      action.update(1, { state: 'active' });
      assert.equal(fakeChromeBrowserAction.title, 'Hypothesis is active');
    });

    it('does not set the title if there is badge text showing', function () {
      const state = {
        state: 'inactive',
        annotationCount: 9,
      };
      action.update(1, state);
      const prevTitle = fakeChromeBrowserAction.title;
      action.update(1, Object.assign(state, { state: 'active' }));
      assert.equal(fakeChromeBrowserAction.title, prevTitle);
    });
  });

  describe('inactive state', function () {
    it('sets the inactive browser icon and title', function () {
      action.update(1, { state: 'inactive' });
      assert.equal(fakeChromeBrowserAction.icon, BrowserAction.icons.inactive);
      assert.equal(fakeChromeBrowserAction.title, 'Hypothesis is inactive');
    });
  });

  describe('error state', function () {
    it('sets the inactive browser icon', function () {
      action.update(1, { state: 'errored' });
      assert.equal(fakeChromeBrowserAction.icon, BrowserAction.icons.inactive);
    });

    it('sets the title of the browser icon', function () {
      action.update(1, { state: 'errored' });
      assert.equal(fakeChromeBrowserAction.title, 'Hypothesis failed to load');
    });

    it('still sets the title even there is badge text showing', function () {
      action.update(1, {
        state: 'errored',
        annotationCount: 9,
      });
      assert.equal(fakeChromeBrowserAction.title, 'Hypothesis failed to load');
    });

    it('shows a badge', function () {
      action.update(1, {
        state: 'errored',
      });
      assert.equal(fakeChromeBrowserAction.badgeText, '!');
    });
  });

  describe('annotation counts', function () {
    it('sets the badge text', function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 23,
      });
      assert.equal(fakeChromeBrowserAction.badgeText, '23');
    });

    it("sets the badge title when there's 1 annotation", function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 1,
      });
      assert.equal(
        fakeChromeBrowserAction.title,
        "There's 1 annotation on this page"
      );
    });

    it("sets the badge title when there's >1 annotation", function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 23,
      });
      assert.equal(
        fakeChromeBrowserAction.title,
        'There are 23 annotations on this page'
      );
    });

    it('does not set the badge text if there are 0 annotations', function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 0,
      });
      assert.equal(fakeChromeBrowserAction.badgeText, '');
    });

    it('does not set the badge title if there are 0 annotations', function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 0,
      });
      assert.equal(fakeChromeBrowserAction.title, 'Hypothesis is inactive');
    });

    it("truncates numbers greater than 999 to '999+'", function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 1001,
      });
      assert.equal(fakeChromeBrowserAction.badgeText, '999+');
      assert.equal(
        fakeChromeBrowserAction.title,
        'There are 999+ annotations on this page'
      );
    });
  });

  describe('build type', function () {
    beforeEach(function () {
      let fakeSettings = {
        buildType: 'qa',
      };
      $imports.$mock({
        './settings': {
          default: fakeSettings,
        },
      });
      action = new BrowserAction(fakeChromeBrowserAction);
    });

    afterEach(() => {
      $imports.$restore();
    });

    it('sets the text to QA when there are no annotations', function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 0,
      });
      assert.equal(fakeChromeBrowserAction.badgeText, 'QA');
    });

    it('shows the annotation count when there are annotations', function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 3,
      });
      assert.equal(fakeChromeBrowserAction.badgeText, '3');
    });

    it('sets the background color', function () {
      action.update(1, {
        state: 'inactive',
        annotationCount: 0,
      });
      assert.equal(fakeChromeBrowserAction.badgeColor, '#EDA061');
    });
  });
});
