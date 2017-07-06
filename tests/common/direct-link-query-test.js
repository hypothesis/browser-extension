'use strict';

var directLinkQuery = require('../../src/common/direct-link-query');

describe('common.direct-link-query', () => {
  it('returns `null` if the URL contains no #annotations fragment', () => {
    var url = 'https://example.com';
    assert.equal(directLinkQuery(url), null);
  });

  it('returns the ID if the URL contains a #annotations:<ID> fragment', () => {
    var url = 'https://example.com/#annotations:1234';
    assert.deepEqual(directLinkQuery(url), {
      id: '1234',
    });
  });

  it('returns the query if the URL contains a #annotations:<query> fragment', () => {
    var url = 'https://example.com/#annotations:query:user%3Ajsmith';
    assert.deepEqual(directLinkQuery(url), {
      query: 'user:jsmith',
    });
  });
});
