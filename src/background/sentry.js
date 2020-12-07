/**
 * This module configures Raven for reporting crashes
 * to Sentry.
 *
 * Logging requires the Sentry DSN and Hypothesis
 * version to be provided via the app's settings object.
 */

import * as Sentry from '@sentry/browser';
import { Integrations } from '@sentry/tracing';

/**
 * @typedef SentryConfig
 * @prop {string} dsn
 * @prop {string} release
 */

/**
 * Initialize the Sentry integration.
 *
 * This will activate Sentry and enable capturing of uncaught errors and
 * unhandled promise rejections.
 *
 * @param {SentryConfig} config
 */
export function init({ dsn, release }) {
  Sentry.init({
    dsn,
    release,
    integrations: [new Integrations.BrowserTracing()],
    tracesSampleRate: 1.0,
  });
}
