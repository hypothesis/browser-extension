import { assert } from 'chai';
import sinon from 'sinon';

// Expose the sinon assertions.
sinon.assert.expose(assert, { prefix: null });

// Expose these globally
globalThis.assert = assert;
globalThis.sinon = sinon;
globalThis.context ??= globalThis.describe;
