import * as errors from '../../src/background/errors';
import { HelpPage, $imports } from '../../src/background/help-page';

describe('HelpPage', () => {
  let fakeChromeTabs;
  let fakeExtensionURL;
  let help;

  beforeEach(() => {
    fakeChromeTabs = { create: sinon.stub() };
    fakeExtensionURL = path => `chrome://abcd${path}`;

    $imports.$mock({
      './chrome-api': {
        chromeAPI: {
          runtime: { getURL: fakeExtensionURL },
          tabs: fakeChromeTabs,
        },
      },
    });

    help = new HelpPage();
  });

  afterEach(() => {
    $imports.$restore();
  });

  describe('showHelpForError', () => {
    [
      {
        getError: () => new errors.LocalFileError('msg'),
        helpSection: 'local-file',
      },
      {
        getError: () => new errors.NoFileAccessError('msg'),
        helpSection: 'no-file-access',
      },
      {
        getError: () => new errors.RestrictedProtocolError('msg'),
        helpSection: 'restricted-protocol',
      },
      {
        getError: () => new errors.BlockedSiteError('msg'),
        helpSection: 'blocked-site',
      },
    ].forEach(({ getError, helpSection }) => {
      it('shows appropriate page for the error', () => {
        help.showHelpForError({ id: 1, index: 1 }, getError());
        assert.called(fakeChromeTabs.create);
        assert.calledWith(fakeChromeTabs.create, {
          index: 2,
          openerTabId: 1,
          url: fakeExtensionURL(`/help/index.html?message=msg#${helpSection}`),
        });
      });
    });

    it('renders the "other-error" page for unknown errors', () => {
      help.showHelpForError({ id: 1, index: 1 }, new Error('Unexpected Error'));
      assert.called(fakeChromeTabs.create);
      assert.calledWith(fakeChromeTabs.create, {
        index: 2,
        openerTabId: 1,
        url: fakeExtensionURL(
          '/help/index.html?message=Unexpected+Error#other-error'
        ),
      });
    });
  });
});
