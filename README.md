Hypothesis browser extension(s)
===============================

[![Build status](https://img.shields.io/travis/hypothesis/browser-extension/master.svg)][travis]
[![#hypothes.is IRC channel](https://img.shields.io/badge/IRC-%23hypothes.is-blue.svg)][irc]
[![BSD licensed](https://img.shields.io/badge/license-BSD-blue.svg)][license]

[travis]: https://travis-ci.org/hypothesis/browser-extension
[irc]: https://www.irccloud.com/invite?channel=%23hypothes.is&amp;hostname=irc.freenode.net&amp;port=6667&amp;ssl=1
[license]: https://github.com/hypothesis/browser-extension/blob/master/LICENSE

The Hypothesis browser extensions allow you to annotate web documents using your
[Hypothesis][service] account.

![Screenshot of Hypothesis client](/images/screenshot.png?raw=true)

[service]: https://hypothes.is

Choose your browser below
-------------------------

|     **Chrome**    |    **Firefox**     |     **Opera**     |     **Safari**    |     **IE**    |
| ----------------- | ------------------ | ----------------- | ----------------- | ------------- |
| [![Chrome][0]][1] | [![Firefox][2]][3] | [![Opera][4]][5]  | [![Safari][6]][7] | [![IE][8]][9] |
| **Now available** | **In development** | `not yet`         | `not yet`         | `not yet`     |



[0]: /images/google-chrome.ico?raw=true "Review and install for Chrome"
[1]: https://chrome.google.com/webstore/detail/hypothesis-web-pdf-annota/bjfhmglciegochdpefhhlphglcehbmek
[2]: /images/mozilla-firefox.ico?raw=true "Nearly there..."
[3]: #not-yet
[4]: /images/opera.png?raw=true "Help wanted"
[5]: #not-yet
[6]: /images/apple-safari.png?raw=true "Help wanted"
[7]: #not-yet
[8]: /images/microsoft-ie.ico?raw=true "Help wanted"
[9]: #not-yet

Development
-----------

The code for the extensions is in the `src/` directory, and can be built into a
browser extension by running:

    npm install
    make

Once this is done you should be able to load the `build/` directory as an
unpacked extension.

The extension code has a test suite, which you can run using:

    npm test

Note that the browser extensions are for the most part just a wrapper around the
[Hypothesis client][client]. Depending on what you're interested in working on,
you may need to check out the client repository too. If you do that, you can get
the browser extension repository to use your checked-out `client` repository by
running

    npm link

in the `client` repository, and then

    npm link hypothesis

in the `browser-extension` repository. After that, a call to `make` will use the
built client from the client repository. Please consult the client's
documentation for instructions on building the client in a development
environment.

**Tip**: If you get a **permission denied** error when running `npm link`
you probably need to fix npm's permissions. See
[Fixing npm permissions](https://docs.npmjs.com/getting-started/fixing-npm-permissions).

**Tip**: To **unlink** your dev browser extension from your dev client run
`npm unlink hypothesis` in your browser extension directory
(see the [npm uninstall docs](https://docs.npmjs.com/cli/uninstall)).

See [Building the extension](docs/building.md) for more information.

[client]: https://github.com/hypothesis/client/

Community
---------

Join us in [#hypothes.is][irc] on [freenode](https://freenode.net/) for
discussion.

If you'd like to contribute to the project, you should consider subscribing to
the [development mailing list][ml], where we can help you plan your
contributions.

Please note that this project is released with a [Contributor Code of
Conduct][coc]. By participating in this project you agree to abide by its terms.

[ml]: https://groups.google.com/a/list.hypothes.is/forum/#!forum/dev
[coc]: https://github.com/hypothesis/browser-extension/blob/master/CODE_OF_CONDUCT

License
-------

The Hypothesis browser extensions are released under the [2-Clause BSD
License][bsd2c], sometimes referred to as the "Simplified BSD License". Some
third-party components are included. They are subject to their own licenses. All
of the license information can be found in the included [LICENSE][license] file.

[bsd2c]: http://www.opensource.org/licenses/BSD-2-Clause
[license]: https://github.com/hypothesis/browser-extensions/blob/master/LICENSE
