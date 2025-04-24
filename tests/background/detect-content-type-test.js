import { detectContentType } from '../../src/background/detect-content-type';

describe('detectContentType', () => {
  const sandbox = sinon.createSandbox();

  let el;
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
  });

  afterEach(() => {
    el.parentElement.removeChild(el);

    sandbox.restore();
  });

  it('returns HTML by default', () => {
    el.innerHTML = '<div></div>';
    assert.deepEqual(detectContentType(), { type: 'HTML' });
  });

  it('returns "PDF" if Google Chrome PDF viewer is present', () => {
    el.innerHTML = '<embed type="application/pdf"></embed>';
    assert.deepEqual(detectContentType(), { type: 'PDF' });
  });

  it('returns "PDF" if Chrome\'s OOPIF PDF viewer is present', () => {
    const fakeOpenOrClosedShadowRoot = sinon.stub();
    vi.stubGlobal('chrome', {
      dom: {
        openOrClosedShadowRoot: fakeOpenOrClosedShadowRoot,
      },
    });

    try {
      const dummyElement = document.createElement('div');
      const pdfViewer = document.createElement('iframe');
      pdfViewer.setAttribute('type', 'application/pdf');
      const fakeBodyShadowRoot = dummyElement.attachShadow({ mode: 'open' });
      fakeBodyShadowRoot.append(pdfViewer);

      fakeOpenOrClosedShadowRoot
        .withArgs(document.body)
        .returns(fakeBodyShadowRoot);

      assert.deepEqual(detectContentType(), { type: 'PDF' });
    } finally {
      vi.unstubAllGlobals();
    }
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
