Building the extension
======================

This document describes how to build the browser extension and load it into your
browser.

Installing the dependencies
---------------------------

You should have [Node v6.x (or later)][node] installed.

Before continuing, install the development dependencies by running the following
at the root of the repository:

    $ npm install

[node]: https://nodejs.org/en/download/

Building the extension
----------------------

The extension build is configured by a JSON settings file, some examples of
which are supplied in the `settings/` directory. To build the extension, you
simply run `make`. To build the extension in its default configuration (a Chrome
development build), run:

    $ make

To build the extension from an alternate settings file, simply specify the
`SETTINGS_FILE` variable when running `make`:

    $ make SETTINGS_FILE=settings/chrome-prod.json

This, for example, will build a production extension: one that talks to the main
<https://hypothes.is> web service.

Building for a local `h` server
-------------------------------

The default settings file used is `chrome-dev.json` but it does not contain a 
value for the `oauthClientId`. If you are running your own version of `h` 
simply create an oauth client ID in the admin UI for the browser extension.

http://localhost:5000/admin/oauthclients

**Client OAuth Values**

    Name: Browser Extension
    Authority: localhost
    Grant type: authorization_code
    Redirect URL: chrome-extension://<extension id>

Where `<extension id>` is the ID of the browser extension. You may need to load the extension 
into chrome the first to view the ID. Skip ahead to _Loading an extension into Chrome_
below. Next, add the generated ID value to the config file you are using. e.g inside of 
`chrome-dev.json` add

```
"oauthClientId": "<32 digit value>"
```

> Note:
> It may be convenient to create a new config file called `custom.json` based 
> on `chrome-dev.json` with your  `oauthClientId` value.
>
>       $ make SETTINGS_FILE=settings/custom.json

For instructions how to set up a client with your `h` server, see 
https://h-client.readthedocs.io/en/latest/developers/developing/#running-the-client-from-h*


Loading an extension into Chrome
--------------------------------

Once you've built the extension, you will be able to load the `build/` directory
as an unpacked extension:

1.  Go to `chrome://extensions/` in Chrome.
2. If you used the `chrome-prod.json` settings file to build a production
   extension, you will need to **remove** the "real" production extension from
   Chrome before loading your locally built one or create a new Chrome profile
   without the real one installed.
3.  Tick **Developer mode**.
4.  Click **Load unpacked extension**.
5.  Browse to the `build/` directory where the extension was built and select it.

Your extension should be working now! Remember that if you built a development
extension it will point to a Hypothesis service running on
<http://localhost:5000>. You may need to have Hypothesis running for the
extension to function.
