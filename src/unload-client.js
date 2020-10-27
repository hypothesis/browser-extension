// Script injected into the page to trigger removal of any existing instances
// of the Hypothesis client.

'use strict';

const annotatorLink = document.querySelector(
  'link[type="application/annotator+html"]'
);

if (annotatorLink) {
  // Dispatch a 'destroy' event which is handled by the code in
  // annotator/main.js to remove the client.
  const destroyEvent = new Event('destroy');
  annotatorLink.dispatchEvent(destroyEvent);
}
