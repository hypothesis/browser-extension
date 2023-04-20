import * as errors from '../../src/background/errors';

describe('errors', () => {
  let fakeRaven;

  beforeEach(() => {
    fakeRaven = {
      report: sinon.stub(),
    };
    errors.$imports.$mock({
      './raven': fakeRaven,
    });
    sinon.stub(console, 'error');
  });

  afterEach(() => {
    console.error.restore();
    errors.$imports.$restore();
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
    it('reports unknown errors via Raven', () => {
      const error = new Error('A most unexpected error');
      errors.report(error, 'injecting the sidebar');
      assert.calledWith(fakeRaven.report, error, 'injecting the sidebar');
    });

    it('does not report known errors via Raven', () => {
      const error = new errors.LocalFileError('some message');
      errors.report(error, 'injecting the sidebar');
      assert.notCalled(fakeRaven.report);
    });
  });
});
