/**
 * Incomplete type for settings in the `settings.json` file.
 *
 * This contains only the settings that the background script uses. Other
 * settings are used when generating the `manifest.json` file.
 */
export type Settings = {
  apiUrl: string;
  buildType: string;
  serviceUrl: string;
};

// nb. This will error if the build has not been run yet.
import rawSettings from '../../build/settings.json';

/**
 * Configuration data for the extension.
 */
const settings: Settings = {
  ...rawSettings,

  // Ensure API url does not end with '/'
  apiUrl: rawSettings.apiUrl.replace(/\/$/, ''),
};

export default settings;
