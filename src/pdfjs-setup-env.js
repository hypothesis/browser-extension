'use strict';

// This script sets up the global environment before the PDF.js scripts are
// loaded. This is used both in document and web worker contexts.

// Pre-define `regeneratorRuntime` so that PDF.js doesn't crash if loaded
// in an environment which disallows execution of inline scripts.
//
// We can remove this after upgrading to a newer version of PDF.js which uses
// native async/await support.
//
// @ts-ignore
self.regeneratorRuntime = null;
