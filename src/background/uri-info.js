import settings from './settings';
import { BadgeUriError } from './errors';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// The following sites are personal in nature, high potential traffic
// and URLs don't correspond to identifiable content
const BLOCKED_HOSTNAMES = new Set([
  'facebook.com',
  'www.facebook.com',
  'mail.google.com',
]);

/**
 * Encodes a string for use in a query parameter.
 *
 * @param {string} val
 */
function encodeUriQuery(val) {
  return encodeURIComponent(val).replace(/%20/g, '+');
}

/**
 * Returns a normalized version of URI for use in badge requests, or throws BadgeUrlError
 * if badge requests cannot be made for the given URL
 *
 * The normalization consist on (1) adding a final '/' at the end of the URL and
 * (2) removing the fragment from the URL. The URL fragment can be ignored as it
 *  will result the same badge count.
 *
 *  In addition, this normalization facilitates the identification of unique URLs.
 *
 * @param {string} uri
 * @return {string} - URL without fragment
 * @throws Will throw if URL is invalid or should not be sent to the 'badge' request endpoint
 */
export function uriForBadgeRequest(uri) {
  const url = new URL(uri);

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new BadgeUriError('Blocked protocol');
  }

  if (BLOCKED_HOSTNAMES.has(url.hostname)) {
    throw new BadgeUriError('Blocked hostname');
  }

  url.hash = '';

  return url.toString();
}

/**
 * Queries the Hypothesis service that provides statistics about the annotations
 * for a given URL.
 *
 * @param {string} uri
 * @return {Promise<number>}
 * @throws Will throw a variety of errors: network, json parsing, or wrong format errors.
 */
export async function fetchAnnotationCount(uri) {
  const response = await fetch(
    settings.apiUrl + '/badge?uri=' + encodeUriQuery(uri),
    {
      credentials: 'include',
    }
  );

  const data = await response.json();

  if (data && typeof data.total === 'number') {
    return data.total;
  }

  throw new Error('Unable to parse badge response');
}
