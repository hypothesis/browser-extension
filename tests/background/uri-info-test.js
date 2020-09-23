import * as uriInfo from '../../src/background/uri-info';
//import { toResult } from '../promise-util';
import settings from '../settings.json';

describe('background/uri-info', () => {
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

  describe('getAnnotationCount', () => {
    describe('fetching data from badge endpoint', () => {
      it('sends the correct fetch request', () => {
        return uriInfo.getAnnotationCount('http://tabUrl.com').then(() => {
          assert.equal(fetchStub.callCount, 1);
          assert.deepEqual(fetchStub.lastCall.args, [
            badgeURL + '?uri=http%3A%2F%2FtabUrl.com',
            { credentials: 'include' },
          ]);
        });
      });

      it('urlencodes the URL appropriately', () => {
        return uriInfo
          .getAnnotationCount('http://foo.com?bar=baz qüx')
          .then(() => {
            assert.equal(fetchStub.callCount, 1);
            assert.equal(
              fetchStub.lastCall.args[0],
              badgeURL + '?uri=http%3A%2F%2Ffoo.com%3Fbar%3Dbaz+q%C3%BCx'
            );
          });
      });
    });

    [
      'chrome://extensions',
      'chrome://newtab',
      'http://www.facebook.com',
      'https://facebook.com',
      'https://mail.google.com',
      'http://www.facebook.com/some/page/',
    ].forEach(badURI => {
      it('does not send request to API if URI matches blocklist entries', () => {
        uriInfo.getAnnotationCount(badURI);
        assert.equal(fetchStub.callCount, 0);
      });
    });

    [
      'https://www.google.com',
      'file://whatever',
      'http://www.example.com',
      'chrome-extension://fadpmhkjbfijelnpfnjmnghgokbppplf/pdfjs/web/viewer.html?file=http%3A%2F%2Fwww.pdf995.com%2Fsamples%2Fpdf.pdf',
    ].forEach(okURI => {
      it('sends request to API if URI does not match blocklist entries', () => {
        uriInfo.getAnnotationCount(okURI);
        assert.equal(fetchStub.callCount, 1);
      });
    });

    it('returns value from API service', () => {
      return uriInfo
        .getAnnotationCount('http://www.example.com')
        .then(result => {
          assert.equal(result, 1);
        });
    });

    [
      'this is not valid json',
      '{"total": "not a valid number"}',
      '{"rows": []}',
      '{"foop": 5}',
    ].forEach(badBody => {
      it('warns if result is invalid and returns 0', () => {
        fetchStub.resolves(
          new Response(badBody, {
            status: 200,
            headers: {},
          })
        );
        return uriInfo
          .getAnnotationCount('http://www.example.com')
          .then(result => {
            assert.equal(result, 0);
          });
      });
    });

    it('warns if fetch throws and returns 0', () => {
      fetchStub.rejects();

      return uriInfo
        .getAnnotationCount('http://www.example.com')
        .then(result => {
          assert.equal(result, 0);
        });
    });
  });
});
