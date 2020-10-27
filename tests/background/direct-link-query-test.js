import directLinkQuery from '../../src/background/direct-link-query';

describe('common.direct-link-query', () => {
  it('returns `null` if the URL contains no #annotations fragment', () => {
    const url = 'https://example.com';
    assert.equal(directLinkQuery(url), null);
  });

  it('returns the annotation ID if the URL contains a #annotations:<ID> fragment', () => {
    const url = 'https://example.com/#annotations:1234';
    assert.deepEqual(directLinkQuery(url), {
      annotations: '1234',
    });
  });

  it('does not return annotation ID if it is invalid', () => {
    // "invalid" here refers only to the character set, not whether the annotation
    // actually exists.
    const url = 'https://example.com/#annotations:[foo]';
    assert.equal(directLinkQuery(url), null);
  });

  it('returns the query if the URL contains a #annotations:query:<query> fragment', () => {
    const url = 'https://example.com/#annotations:query:user%3Ajsmith';
    assert.deepEqual(directLinkQuery(url), {
      query: 'user:jsmith',
    });
  });

  ['123', 'abcDEF456', '__world__'].forEach(groupId => {
    it('returns the group ID if the URL contains a #annotations:group:<ID> fragment', () => {
      const url = `https://example.com/#annotations:group:${groupId}`;
      assert.deepEqual(directLinkQuery(url), {
        group: groupId,
      });
    });
  });

  it('does not return group ID if it is invalid', () => {
    // "invalid" here refers only to the character set, not whether the group
    // actually exists.
    const url = 'https://example.com/#annotations:group:%%%';
    assert.deepEqual(directLinkQuery(url), null);
  });
});
