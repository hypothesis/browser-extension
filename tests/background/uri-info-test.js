import { BadgeUriError } from '../../src/background/errors';
import * as uriInfo from '../../src/background/uri-info';
import settings from '../settings.json';

describe('background/uri-info', () => {
  describe('uriForBadgeRequest', () => {
    ['http://.com', 'https://', 'dummy.com'].forEach(badURI => {
      it('throws for invalid URL', () => {
        try {
          uriInfo.uriForBadgeRequest(badURI);
        } catch (error) {
          assert.instanceOf(error, TypeError);
        }
      });
    });

    [
      'http://www.facebook.com',
      'https://facebook.com',
      'https://mail.google.com',
      'http://www.facebook.com/some/page/',
    ].forEach(blockedHostname => {
      it('throws for blocked hostnames', () => {
        try {
          uriInfo.uriForBadgeRequest(blockedHostname);
        } catch (error) {
          assert.instanceOf(error, BadgeUriError);
          assert.equal(error.message, 'Blocked hostname');
        }
      });
    });

    [
      'chrome://extensions',
      'chrome://newtab',
      'chrome-extension://fadpmhkjbfijelnpfnjmnghgokbppplf/pdfjs/web/viewer.html?file=http%3A%2F%2Fwww.pdf995.com%2Fsamples%2Fpdf.pdf',
      'file://whatever',
    ].forEach(blockedProtocol => {
      it('throws for blocked protocol', () => {
        try {
          uriInfo.uriForBadgeRequest(blockedProtocol);
        } catch (error) {
          assert.instanceOf(error, BadgeUriError);
          assert.equal(error.message, 'Blocked protocol');
        }
      });
    });

    ['https://www.google.com', 'http://www.example.com'].forEach(okURI => {
      it('returns a URI with final slash added', () => {
        assert.strictEqual(uriInfo.uriForBadgeRequest(okURI), `${okURI}/`);
      });
    });

    [
      'https://www.google.com#1',
      'https://www.google.com#',
      'https://www.google.com',
    ].forEach(okURI => {
      it('removes the fragment', () => {
        assert.strictEqual(
          uriInfo.uriForBadgeRequest(okURI),
          'https://www.google.com/'
        );
      });
    });
  });

  describe('fetchAnnotationCount', () => {
    const badgeURL = `${settings.apiUrl}/badge`;
    let fetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub(window, 'fetch').resolves(
        new Response('{"total": 1}', {
          status: 200,
          headers: {},
        })
      );
    });

    afterEach(() => {
      window.fetch.restore();
    });

    it('returns value from API service', async () => {
      const result = await uriInfo.fetchAnnotationCount(
        'http://www.example.com'
      );
      assert.equal(result, 1);
    });

    it('sends the correct fetch request', async () => {
      await uriInfo.fetchAnnotationCount('http://tabUrl.com');
      assert.equal(fetchStub.callCount, 1);
      assert.deepEqual(fetchStub.lastCall.args, [
        badgeURL + '?uri=http%3A%2F%2FtabUrl.com',
        { credentials: 'include' },
      ]);
    });

    it('URL-encodes the URL appropriately', async () => {
      await uriInfo.fetchAnnotationCount('http://foo.com?bar=baz qüx');
      assert.equal(fetchStub.callCount, 1);
      assert.equal(
        fetchStub.lastCall.args[0],
        badgeURL + '?uri=http%3A%2F%2Ffoo.com%3Fbar%3Dbaz+q%C3%BCx'
      );
    });

    ['{"total": "not a valid number"}', '{"rows": []}', '{"foop": 5}'].forEach(
      badBody => {
        it('throws an error if the response has an incorrect format', () => {
          fetchStub.resolves(
            new Response(badBody, {
              status: 200,
              headers: {},
            })
          );
          return uriInfo
            .fetchAnnotationCount('http://www.example.com')
            .catch(error => {
              assert.strictEqual(
                error.message,
                'Unable to parse badge response'
              );
            });
        });
      }
    );

    it('throws an error if the response is not valid JSON', async () => {
      fetchStub.resolves(
        new Response('this is not valid json', {
          status: 200,
          headers: {},
        })
      );

      let error;
      try {
        await uriInfo.fetchAnnotationCount('http://www.example.com');
      } catch (e) {
        error = e;
      }
      assert.instanceOf(error, SyntaxError);
    });

    it('throws errors for other fetch failures', async () => {
      fetchStub.rejects('Network error');

      let error;
      try {
        await uriInfo.fetchAnnotationCount('http://www.example.com');
      } catch (e) {
        error = e;
      }
      assert.strictEqual(error.name, 'Network error');
    });
  });
});
