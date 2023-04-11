'use strict';

/* global PDFViewerApplication */

// This script is run once PDF.js has loaded and it configures the viewer
// and injects the Hypothesis client.

// Configure Hypothesis client to load assets from the extension instead of
// the CDN.
//
// Note this configuration is duplicated in `src/background/extension.js`. Any
// changes made here must be reflected there as well.
const clientConfig = {
  assetRoot: '/client/',
  sidebarAppUrl: '/client/app.html',
  notebookAppUrl: '/client/notebook.html',
  profileAppUrl: '/client/profile.html',
};

const configScript = document.createElement('script');
configScript.type = 'application/json';
configScript.className = 'js-hypothesis-config';
configScript.textContent = JSON.stringify(clientConfig);
// This ensures the client removes the script when the extension is deactivated
configScript.setAttribute('data-remove-on-unload', '');
document.head.appendChild(configScript);

// See https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage
document.addEventListener('webviewerloaded', () => {
  // Wait for the PDF viewer to be fully initialized before loading the client.
  // Note that the PDF may still be loading after initialization.

  // @ts-expect-error - PDFViewerApplication is missing from types.
  PDFViewerApplication.initializedPromise.then(() => {
    const embedScript = document.createElement('script');
    embedScript.src = '/client/build/boot.js';
    document.body.appendChild(embedScript);
  });
});
