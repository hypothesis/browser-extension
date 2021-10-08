import * as raven from './raven';
import settings from './settings';
import './hypothesis-chrome-extension';
import './install';

if (settings.raven) {
  raven.init(settings.raven);
}
