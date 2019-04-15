'use strict';

var directLinkQuery = require('../../src/common/direct-link-query');

describe('common.direct-link-query', () => {
  it('returns `null` if the URL contains no #annotations fragment', () => {
    var url = 'https://example.com';
    assert.equal(directLinkQuery(url), null);
  });

  it('returns the annotation ID if the URL contains a #annotations:<ID> fragment', () => {
    var url = 'https://example.com/#annotations:1234';
    assert.deepEqual(directLinkQuery(url), {
      annotations: '1234',
    });
  });

  it('does not return annotation ID if it is invalid', () => {
    // "invalid" here refers only to the character set, not whether the annotation
    // actually exists.
    var url = 'https://example.com/#annotations:[foo]';
    assert.equal(directLinkQuery(url), null);
  });

  it('returns the query if the URL contains a #annotations:query:<query> fragment', () => {
    var url = 'https://example.com/#annotations:query:user%3Ajsmith';
    assert.deepEqual(directLinkQuery(url), {
      query: 'user:jsmith',
    });
  });

  it('returns the group ID if the URL contains a #annotations:group:<ID> fragment', () => {
    var url = 'https://example.com/#annotations:group:123';
    assert.deepEqual(directLinkQuery(url), {
      group: '123',
    });
  });

  it('does not return group ID if it is invalid', () => {
    // "invalid" here refers only to the character set, not whether the group
    // actually exists.
    var url = 'https://example.com/#annotations:group:%%%';
    assert.deepEqual(directLinkQuery(url), null);
  });
});
