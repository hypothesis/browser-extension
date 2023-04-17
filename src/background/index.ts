import { init } from './install';
import * as raven from './raven';
import settings from './settings';

if (settings.raven) {
  raven.init(settings.raven);
}
init();
