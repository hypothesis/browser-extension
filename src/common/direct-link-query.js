'use strict';

/**
 * @typedef {Object} Query
 * @property [string] id
 * @property [string] query
 */

/**
 * Extracts a direct-linked annotation ID or query from the fragment of a URL.
 *
 * @param {string} url - The URL which may contain a '#annotations:<ID>'
 *        or '#annotations:query:<query>' fragment.
 * @return {Query|null}
 */
function directLinkQuery(url) {
  // Annotation IDs are url-safe-base64 identifiers
  // See https://tools.ietf.org/html/rfc4648#page-7
  var idMatch = url.match(/#annotations:([A-Za-z0-9_-]+)$/);
  if (idMatch) {
    return { id: idMatch[1] };
  }

  var queryMatch = url.match(/#annotations:query:(.*)$/);
  if (queryMatch) {
    let query = decodeURIComponent(queryMatch[1]);
    return { query };
  }

  return null;
}

module.exports = directLinkQuery;
