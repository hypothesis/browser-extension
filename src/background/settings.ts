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
const raw = rawSettings as Record<string, unknown>;

function isValidSettings(obj: Record<string, unknown>): obj is Record<keyof Settings, unknown> {
  return (
    typeof obj.apiUrl === 'string' &&
    typeof obj.buildType === 'string' &&
    typeof obj.serviceUrl === 'string'
  );
}

if (!isValidSettings(raw)) {
  throw new Error('Invalid settings.json structure');
}

const settings: Settings = {
  apiUrl: raw.apiUrl.replace(/\/$/, ''),
  buildType: raw.buildType,
  serviceUrl: raw.serviceUrl,
};

export default settings;
