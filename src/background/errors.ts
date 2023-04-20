export class ExtensionError extends Error {}

export class LocalFileError extends ExtensionError {}

export class NoFileAccessError extends ExtensionError {}

export class RestrictedProtocolError extends ExtensionError {}

export class BlockedSiteError extends ExtensionError {}

export class AlreadyInjectedError extends ExtensionError {}

export class RequestCanceledError extends Error {}

export class BadgeUriError extends Error {}

/**
 * Returns true if `err` is a recognized 'expected' error.
 */
function isKnownError(err: unknown) {
  return err instanceof ExtensionError;
}

const IGNORED_ERRORS = [
  // Errors that can happen when the tab is closed during injection
  /The tab was closed/,
  /No tab with id.*/,
  // Attempts to access pages for which Chrome does not allow scripting
  /Cannot access contents of.*/,
  /The extensions gallery cannot be scripted/,
  // The extension is disabled on LMS assignments to avoid confusion with the
  // embedded Hypothesis instance. The user can still use the extension on other
  // pages hosted in the LMS itself.
  /Hypothesis extension can't be used on Hypothesis LMS assignments/,
];

/**
 * Returns true if a given `err` is anticipated during client injection, such
 * as the tab being closed by the user, and should not be reported to Sentry.
 *
 * @param err - The Error-like object
 */
export function shouldIgnoreInjectionError(err: { message: string }) {
  if (IGNORED_ERRORS.some(pattern => err.message.match(pattern))) {
    return true;
  }
  if (isKnownError(err)) {
    return true;
  }
  return false;
}

/**
 * Report an error.
 *
 * All errors are logged to the console. Additionally unexpected errors,
 * ie. those which are not instances of ExtensionError, are reported to
 * Sentry.
 *
 * @param error - The error which happened.
 * @param when - Describes the context in which the error occurred.
 * @param context - Additional context for the error.
 */
export function report(error: Error, when: string, context?: object) {
  console.error(when, error, context);
}
