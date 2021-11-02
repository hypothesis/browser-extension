/**
 * Incomplete type for settings in the `settings.json` file.
 *
 * @typedef Settings
 * @prop {string} apiUrl
 * @prop {string} buildType
 * @prop {{ dsn: string, release: string}} [raven]
 * @prop {string} serviceUrl
 */

// @ts-ignore - Ignore missing module if file has not been generated.
import settings from '../../build/settings.json';

/**
 * Validate and normalize the given settings data.
 *
 * @param {Settings} settings
 */
function normalizeSettings(settings) {
  // Make sure that apiUrl does not end with a /.
  if (settings.apiUrl.charAt(settings.apiUrl.length - 1) === '/') {
    settings.apiUrl = settings.apiUrl.slice(0, -1);
  }
  return settings;
}

/**
 * Returns the configuration object for the Chrome extension
 */
export default normalizeSettings(settings);
