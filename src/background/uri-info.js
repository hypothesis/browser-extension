import settings from './settings';

const BLOCKLIST = [
  /* browser-specific URLs don't correspond to a meaningful document to annotate */
  { urlProperty: 'protocol', value: 'chrome:' },
  /* The following sites are personal in nature, high potential traffic
     and URLs don't correspond to identifiable content */
  { urlProperty: 'hostname', value: 'facebook.com' },
  { urlProperty: 'hostname', value: 'www.facebook.com' },
  { urlProperty: 'hostname', value: 'mail.google.com' },
];

/** encodeUriQuery encodes a string for use in a query parameter */
function encodeUriQuery(val) {
  return encodeURIComponent(val).replace(/%20/g, '+');
}

/**
 * Should we send a "badge" request to obtain the annotation count for the
 * URL `uri`?
 *
 * @param {string} uri
 * @return {boolean}
 */
function shouldQueryUri(uri) {
  let url;

  try {
    url = new URL(uri);
  } catch (e) {
    return false;
  }

  // Make sure `uri` does not match ANY item in the blocklist
  return BLOCKLIST.every(
    blockedItem => url[blockedItem.urlProperty] !== blockedItem.value
  );
}

/**
 * Queries the Hypothesis service that provides
 * statistics about the annotations for a given URL.
 */
function query(uri) {
  return fetch(settings.apiUrl + '/badge?uri=' + encodeUriQuery(uri), {
    credentials: 'include',
  }).then(res => res.json());
}

/**
 * Retrieve the count of available annotations for `uri`
 *
 * @return {Promise<number>} - Annotation count for `uri`. Will be 0 if URI
 *                             has a blocklist match or there are problems with
 *                             the request to or response from the API
 */
export function getAnnotationCount(uri) {
  const noValue = 0;
  if (shouldQueryUri(uri)) {
    return query(uri)
      .then(data => {
        if (!data || typeof data.total !== 'number') {
          return noValue;
        }
        return data.total;
      })
      .catch(() => {
        return noValue;
      });
  } else {
    return Promise.resolve(noValue);
  }
}
