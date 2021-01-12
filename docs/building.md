# Building the extension

This document describes how to build the browser extension and load it into your
browser.

## Installing the dependencies

You should have [Node v6.x (or later)][node] installed.

Before continuing, install the development dependencies by running the following
at the root of the repository:

    $ yarn install

[node]: https://nodejs.org/en/download/

## Building the extension

The extension build is configured by a JSON settings file, some examples of
which are supplied in the `settings/` directory. To build the extension using
the default settings file (`settings/chrome-dev.json`), run `make build`:

    $ make build

To build the extension from a different settings file, provide a
`SETTINGS_FILE` path to `make build`:

    $ make build SETTINGS_FILE=settings/chrome-prod.json

This, for example, will build a production extension: one that talks to the main
<https://hypothes.is> web service.

## Building for a local `h` server

> Note:
> It may be convenient to create a new, untracked config file
> based on `chrome-dev.json` to maintain your settings
> (here called `custom.json`):
>
>       $ make build SETTINGS_FILE=settings/custom.json

> These instructions assume you have the `h` service running locally already.
> For instructions how to set up a client with your `h` server, see
> https://h-client.readthedocs.io/en/latest/developers/developing/#running-the-client-from-h*

1. [Create an OAuthClient](http://localhost:5000/admin/oauthclients)
   for the extension to use in your local instance of `h`, using the following values:

   ```
   Name: Chrome Extension
   Authority: localhost
   Grant type: authorization_code
   Redirect URL: chrome-extension://<extension id>
   ```

   You won't know the extension ID yet, and that's OK.

1. Set an `oauthClientId` property in your settings JSON. Its value should
   be the 32-character ID of this newly-created OAuthClient.
1. Use `make build` to build the extension against these settings.
1. Load the built extension into Chrome and find its extension ID
   (see "Loading an extension..." below).
1. Return to the OAuthClient you created above in `h` and update the Redirect
   URL to contain the real extension ID.

That should do it!

## Loading an extension into Chrome

Once you've built the extension, you will be able to load the `build/` directory
as an unpacked extension:

1.  Go to `chrome://extensions/` in Chrome.
1.  If you used the `chrome-prod.json` settings file to build a production
    extension, you will need to **remove** the "real" production extension from
    Chrome before loading your locally built one or create a new Chrome profile
    without the real one installed.
1.  Tick **Developer mode**.
1.  Click **Load unpacked extension**.
1.  Browse to the `build/` directory where the extension was built and select it.
