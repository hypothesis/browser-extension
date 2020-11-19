'use strict';

// Configure Hypothesis client to load assets from the extension instead of
// the CDN.
const clientConfig = {
  assetRoot: '/client/',
  sidebarAppUrl: '/client/app.html',
  notebookAppUrl: '/client/notebook.html',
};

const configScript = document.createElement('script');
configScript.type = 'application/json';
configScript.className = 'js-hypothesis-config';
configScript.textContent = JSON.stringify(clientConfig);
document.head.appendChild(configScript);

// Listen for `webviewerloaded` event to configure the viewer after its files
// have been loaded but before it is initialized.
document.addEventListener('webviewerloaded', () => {
  // @ts-expect-error - PDFViewerApplicationOptions is missing from types.
  const appOptions = window.PDFViewerApplicationOptions;
  // @ts-expect-error - PDFViewerApplication is missing from types.
  const app = window.PDFViewerApplication;

  // Ensure that PDF.js viewer events such as "documentloaded" are dispatched
  // to the DOM. The client relies on this.
  appOptions.set('eventBusDispatchToDOM', true);

  // Disable preferences support, as otherwise this will result in `eventBusDispatchToDOM`
  // being overridden with the default value of `false`.
  appOptions.set('disablePreferences', true);

  // Wait for the PDF viewer to be fully initialized and then load the Hypothesis client.
  //
  // This is required because the client currently assumes that `PDFViewerApplication`
  // is fully initialized when it loads. Note that "fully initialized" only means
  // that the PDF viewer application's components have been initialized. The
  // PDF itself will still be loading, and the client will wait for that to
  // complete before fetching annotations.
  //
  const pdfjsInitialized = /** @type {Promise<void>} */ (new Promise(
    resolve => {
      // Poll `app.initialized` as there doesn't appear to be an event that
      // we can listen to.
      const timer = setInterval(() => {
        if (app.initialized) {
          clearTimeout(timer);
          resolve();
        }
      }, 20);
    }
  ));

  pdfjsInitialized.then(() => {
    const embedScript = document.createElement('script');
    embedScript.src = '/client/build/boot.js';
    document.body.appendChild(embedScript);
  });
});
