/**
 * Returns the name of the current browser.
 *
 * @return {'chrome'|'firefox'}
 */
export default function browserName() {
  if (window.browser) {
    return 'firefox';
  } else {
    return 'chrome';
  }
}
