'use strict';

/**
 * Subset of the client configuration which causes the client to show a
 * particular set of annotations automatically after it loads.
 *
 * See https://h-client.readthedocs.io/en/latest/publishers/config/#config-settings
 *
 * @typedef {Object} Query
 * @property {string} [annotations] - ID of the direct-linked annotation
 * @property {string} [query] - Filter query from the sidebar
 * @property {string} [group] - ID of the direct-linked group
 */

/**
 * Extracts the direct-linking query from the URL if any.
 *
 * If present, the query causes the extension to activate automatically and
 * show the matching set of annotations.
 *
 * @param {string} url -
 *   The URL which may contain a '#annotations:' fragment specifying which
 *   annotations to show.
 * @return {Query|null}
 *   The direct link query translated into client configuration settings.
 */
function directLinkQuery(url) {
  // Annotation IDs are url-safe-base64 identifiers
  // See https://tools.ietf.org/html/rfc4648#page-7
  var idMatch = url.match(/#annotations:([A-Za-z0-9_-]+)$/);
  if (idMatch) {
    return { annotations: idMatch[1] };
  }

  var queryMatch = url.match(/#annotations:query:(.*)$/);
  if (queryMatch) {
    let query = decodeURIComponent(queryMatch[1]);
    return { query };
  }

  var groupMatch = url.match(/#annotations:group:(.*)$/);
  if (groupMatch) {
    return { group: groupMatch[1] };
  }

  return null;
}

module.exports = directLinkQuery;
