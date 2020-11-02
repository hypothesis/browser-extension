/**
 * Returns the name of the current browser.
 *
 * @return {'chrome'|'firefox'}
 */
export default function browserName() {
  // @ts-expect-error - `browser` is missing from types
  if (window.browser) {
    return 'firefox';
  } else {
    return 'chrome';
  }
}
