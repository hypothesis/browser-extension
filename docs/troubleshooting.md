Troubleshooting
---------------

Here are some errors you might encounter while developing the extension, and
some explanations and solutions for them.

### Mixed Content errors in the console

The extension fails to load and you see `Mixed Content` errors in the console.
When using the extension on sites served over HTTPS, the extension must be
configured to use a HTTPS `serviceUrl` in its settings file.

### Insecure Response errors in the console

You've built the extension with an HTTPS `serviceUrl`, the extension fails to
load and you see `net::ERR_INSECURE_RESPONSE` errors in the console. You need to
open <https://localhost:5000> (or whatever `serviceUrl` you provided) and tell
the browser to allow access to the site even though the certificate isn't known.

### Empty Response errors in the console

The extension fails to load and you see `GET http://localhost:5000/...
net::ERR_EMPTY_RESPONSE` errors in the console. This can happen if you're
running an HTTPS-only service but you've built the extension with an HTTP
`serviceUrl`. Either run the service on HTTP or rebuild the extension with the
correct settings.

### Connection Refused errors in the console

The extension fails to load and you see `GET https://localhost:5000/...
net::ERR_CONNECTION_REFUSED` errors in the console. This can happen if you're
running an HTTP-only service but you've built the extension with an HTTPS
`serviceUrl`. Either run the service on HTTPS or rebuild the extension with the
correct settings.
