import * as sentry from './sentry';

// @ts-expect-error - `EXTENSION_CONFIG` is missing from types
if (window.EXTENSION_CONFIG.raven) {
  // @ts-expect-error - `EXTENSION_CONFIG` is missing from types
  sentry.init(window.EXTENSION_CONFIG.raven);
}

import './hypothesis-chrome-extension';
import './install';
