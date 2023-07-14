export type PDFContentType = { type: 'PDF' };

export type HTMLContentType = { type: 'HTML' };

/** Details of the detected content type. */
export type ContentTypeInfo = PDFContentType | HTMLContentType;

/**
 * Detect the type of content in the current document.
 *
 * This function is injected as a content script into tabs in order to detect
 * the type of content on the page (PDF, HTML) etc.  by sniffing for viewer
 * plugins.
 *
 * In future this could also be extended to support extraction of the URLs of
 * content in embedded viewers where that differs from the tab's main URL.
 *
 * @param document_ - Document to query
 */
/* istanbul ignore next */
export function detectContentType(
  document_ = document,
): ContentTypeInfo | null {
  function detectChromePDFViewer(): PDFContentType | null {
    // When viewing a PDF in Chrome, the viewer consists of a top-level
    // document with an <embed> tag, which in turn instantiates an inner HTML
    // document providing the PDF viewer UI plus another <embed> tag which
    // instantiates the native PDF renderer.
    //
    // The selector below matches the <embed> tag in the top-level document. To
    // see this document, open the developer tools from Chrome's menu rather
    // than right-clicking on the viewport and selecting the 'Inspect' option
    // which will instead show the _inner_ document.
    if (document_.querySelector('embed[type="application/pdf"]')) {
      return { type: 'PDF' };
    }
    return null;
  }

  function detectFirefoxPDFViewer(): PDFContentType | null {
    // The Firefox PDF viewer is an instance of PDF.js.
    //
    // The Firefox PDF plugin specifically can be detected via the <base>
    // tag it includes, which can be done from a content script (which runs
    // in an isolated JS world from the page's own scripts).
    //
    // Generic PDF.js detection can be done by looking for the
    // `window.PDFViewerApplication` object. This however requires running JS
    // code in the same JS context as the page's own code.
    if (document_.baseURI.indexOf('resource://pdf.js') === 0) {
      return { type: 'PDF' };
    }
    return null;
  }

  const detectFns = [detectChromePDFViewer, detectFirefoxPDFViewer];
  for (let i = 0; i < detectFns.length; i++) {
    const typeInfo = detectFns[i]();
    if (typeInfo) {
      return typeInfo;
    }
  }

  return { type: 'HTML' };
}
