import * as raven from './raven';

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
function isKnownError(err) {
  return err instanceof ExtensionError;
}

const IGNORED_ERRORS = [
  // Errors that can happen when the tab is closed during injection
  /The tab was closed/,
  /No tab with id.*/,
  // Attempts to access pages for which Chrome does not allow scripting
  /Cannot access contents of.*/,
  /The extensions gallery cannot be scripted/,
];

/**
 * Returns true if a given `err` is anticipated during sidebar injection, such
 * as the tab being closed by the user, and should not be reported to Sentry.
 *
 * @param {{message: string}} err - The Error-like object
 */
export function shouldIgnoreInjectionError(err) {
  if (
    IGNORED_ERRORS.some(function (pattern) {
      return err.message.match(pattern);
    })
  ) {
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
 * @param {Error} error - The error which happened.
 * @param {string} when - Describes the context in which the error occurred.
 * @param {Object} context - Additional context for the error.
 */
export function report(error, when, context) {
  console.error(when, error);
  if (!isKnownError(error)) {
    raven.report(error, when, context);
  }
}
