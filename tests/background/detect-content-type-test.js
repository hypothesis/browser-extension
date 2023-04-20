import { detectContentType } from '../../src/background/detect-content-type';

describe('detectContentType', () => {
  let el;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.parentElement.removeChild(el);
  });

  it('returns HTML by default', () => {
    el.innerHTML = '<div></div>';
    assert.deepEqual(detectContentType(), { type: 'HTML' });
  });

  it('returns "PDF" if Google Chrome PDF viewer is present', () => {
    el.innerHTML = '<embed type="application/pdf"></embed>';
    assert.deepEqual(detectContentType(), { type: 'PDF' });
  });

  it('returns "PDF" if Firefox PDF viewer is present', () => {
    const fakeDocument = {
      querySelector: function () {
        return null;
      },
      baseURI: 'resource://pdf.js',
    };
    assert.deepEqual(detectContentType(fakeDocument), { type: 'PDF' });
  });
});
