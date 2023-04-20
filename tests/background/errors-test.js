import * as errors from '../../src/background/errors';

describe('errors', () => {
  beforeEach(() => {
    sinon.stub(console, 'error');
  });

  afterEach(() => {
    console.error.restore();
  });

  describe('#shouldIgnoreInjectionError', () => {
    const ignoredErrors = [
      'The tab was closed',
      'No tab with id 42',
      'Cannot access contents of url "file:///C:/t/cpp.pdf". ' +
        'Extension manifest must request permission to access this host.',
      'Cannot access contents of page',
      'The extensions gallery cannot be scripted.',
    ];

    const unexpectedErrors = ['SyntaxError: A typo'];

    it('should be true for "expected" errors', () => {
      ignoredErrors.forEach(message => {
        const error = { message };
        assert.isTrue(errors.shouldIgnoreInjectionError(error));
      });
    });

    it('should be false for unexpected errors', () => {
      unexpectedErrors.forEach(message => {
        const error = { message };
        assert.isFalse(errors.shouldIgnoreInjectionError(error));
      });
    });

    it("should be true for the extension's custom error classes", () => {
      const error = new errors.LocalFileError('some message');
      assert.isTrue(errors.shouldIgnoreInjectionError(error));
    });
  });

  describe('#report', () => {
    it('logs errors', () => {
      const error = new Error('A most unexpected error');
      errors.report(error, 'injecting the client', { foo: 'bar' });
      assert.calledWith(console.error, 'injecting the client', error, {
        foo: 'bar',
      });
    });
  });
});
