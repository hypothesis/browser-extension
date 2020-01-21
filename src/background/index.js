import * as raven from './raven';

if (window.EXTENSION_CONFIG.raven) {
  raven.init(window.EXTENSION_CONFIG.raven);
}

import './hypothesis-chrome-extension';
import './install';
