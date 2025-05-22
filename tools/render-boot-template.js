import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Replace placeholders in the client's boot script with real URLs.
 *
 * Placeholders are single or double-quoted string literals of the form
 * `"__VARIABLE_NAME__"`.
 */
export function renderBootTemplate(src, dest) {
  const getURLCode = path => `chrome.runtime.getURL("${path}")`;

  const assetRoot = getURLCode('/client/');
  const notebookAppUrl = getURLCode('/client/notebook.html');
  const profileAppUrl = getURLCode('/client/profile.html');
  const sidebarAppUrl = getURLCode('/client/app.html');

  const replacements = {
    __ASSET_ROOT__: assetRoot,
    __NOTEBOOK_APP_URL__: notebookAppUrl,
    __PROFILE_APP_URL__: profileAppUrl,
    __SIDEBAR_APP_URL__: sidebarAppUrl,
  };
  const template = readFileSync(src, { encoding: 'utf8' });
  const bootScript = template.replaceAll(
    /"(__[A-Z_0-9]+__)"|'(__[A-Z_0-9]+__)'/g,
    (match, doubleQuoted, singleQuoted) => {
      const name = doubleQuoted || singleQuoted;
      if (!Object.hasOwn(replacements, name)) {
        throw new Error(`Unknown placeholder "${name}" in boot template`);
      }
      return replacements[name];
    },
  );
  writeFileSync(dest, bootScript);
}

const src = process.argv[2];
const dest = process.argv[3];
renderBootTemplate(src, dest);
