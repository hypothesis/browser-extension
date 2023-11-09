# Hypothesis browser extension(s)

[![BSD licensed](https://img.shields.io/badge/license-BSD-blue.svg)][license]

[license]: https://github.com/hypothesis/browser-extension/blob/main/LICENSE

The Hypothesis browser extensions allow you to annotate web documents using your
[Hypothesis][service] account.

![Screenshot of Hypothesis client](/images/screenshot.png?raw=true)

[service]: https://hypothes.is

## Choose your browser below

| **Chrome**        | **Firefox**        |
| ----------------- | ------------------ |
| [![Chrome][0]][1] | [![Firefox][2]][3] |
| **Now available** | **In development** |

[0]: /images/google-chrome.ico?raw=true 'Review and install for Chrome'
[1]: https://chrome.google.com/webstore/detail/hypothesis-web-pdf-annota/bjfhmglciegochdpefhhlphglcehbmek
[2]: /images/mozilla-firefox.ico?raw=true 'Nearly there...'
[3]: #not-yet

## Development

The code for the extensions is in the `src/` directory, and can be built into a
browser extension by running:

    make build

Once this is done you should be able to load the `build/` directory as an
unpacked extension.

The extension code has a test suite, which you can run using:

    make test

Note that the browser extensions are for the most part just a wrapper around the
[Hypothesis client][client]. Depending on what you're interested in working on,
you may need to check out the client repository too. Once you have checked out and
built the Hypothesis client, you can use it by running the following command in
the `browser-extension` repository:

    yarn link ../client

Where "../client" is the path to your Hypothesis client checkout. After that
a call to `make build` will use the built client from the client repository.
Please consult the client's documentation for instructions on building the
client in a development environment.

**Tip**: To **unlink** your dev browser extension from your dev client run
`yarn unlink hypothesis` in your browser extension directory
(see the [yarn uninstall docs](https://classic.yarnpkg.com/en/docs/cli/unlink/)).

See [Building the extension](docs/building.md) for more information.

[client]: https://github.com/hypothesis/client/

## Community

Join us on Slack for discussion. Please see [our contact
page](https://web.hypothes.is/contact/) for details of how to register.

For help using the extension, please see our [Help pages](https://web.hypothes.is/help/).

If you'd like to contribute to the project, you should consider subscribing to
the [development mailing list][ml], where we can help you plan your
contributions.

Please note that this project is released with a [Contributor Code of
Conduct][coc]. By participating in this project you agree to abide by its terms.

[ml]: https://groups.google.com/a/list.hypothes.is/forum/#!forum/dev
[coc]: https://github.com/hypothesis/browser-extension/blob/main/CODE_OF_CONDUCT

## License

The Hypothesis browser extensions are released under the [2-Clause BSD
License][bsd2c], sometimes referred to as the "Simplified BSD License". Some
third-party components are included. They are subject to their own licenses. All
of the license information can be found in the included [LICENSE][license] file.

[bsd2c]: http://www.opensource.org/licenses/BSD-2-Clause
[license]: https://github.com/hypothesis/browser-extensions/blob/main/LICENSE
