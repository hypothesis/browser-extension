/**
 * Subset of the client configuration which causes the client to show a
 * particular set of annotations automatically after it loads.
 *
 * See https://h-client.readthedocs.io/en/latest/publishers/config/#config-settings
 */
export type Query = {
  /** ID of the direct-linked annotation. */
  annotations?: string;
  /** Filter query for the sidebar. */
  query?: string;
  /** ID of the direct-linked group. */
  group?: string;
};

/**
 * Extracts the direct-linking query from the URL if any.
 *
 * If present, the query causes the extension to activate automatically and
 * show the matching set of annotations.
 *
 * @param url -
 *   The URL which may contain a '#annotations:' fragment specifying which
 *   annotations to show.
 * @return - The direct link query translated into client configuration settings.
 */
export function directLinkQuery(url: string): Query | null {
  // Annotation IDs are url-safe-base64 identifiers
  // See https://tools.ietf.org/html/rfc4648#page-7
  const idMatch = url.match(/#annotations:([A-Za-z0-9_-]+)$/);
  if (idMatch) {
    return { annotations: idMatch[1] };
  }

  const queryMatch = url.match(/#annotations:query:(.*)$/);
  if (queryMatch) {
    const query = decodeURIComponent(queryMatch[1]);
    return { query };
  }

  // Group IDs (and other "pubids" in h) are a subset of ASCII letters and
  // digits. As a special exception, the "Public" group has underscores in its
  // ID ("__world__").
  const groupMatch = url.match(/#annotations:group:([A-Za-z0-9_]+)$/);
  if (groupMatch) {
    return { group: groupMatch[1] };
  }

  return null;
}
