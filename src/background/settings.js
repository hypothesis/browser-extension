/**
 * Incomplete type for settings in the `settings.json` file.
 *
 * This contains only the settings that the background script uses. Other
 * settings are used when generating the `manifest.json` file.
 *
 * @typedef Settings
 * @prop {string} apiUrl
 * @prop {string} buildType
 * @prop {{ dsn: string, release: string }} [raven]
 * @prop {string} serviceUrl
 */

// nb. This will error if the build has not been run yet.
import settings from '../../build/settings.json';

/**
 * Configuration data for the extension.
 */
export default /** @type {Settings} */ ({
  ...settings,

  // Ensure API url does not end with '/'
  apiUrl: settings.apiUrl.replace(/\/^/, ''),
});
