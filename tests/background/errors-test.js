import * as errors from '../../src/background/errors';

describe('errors', function () {
  let fakeRaven;

  beforeEach(function () {
    fakeRaven = {
      report: sinon.stub(),
    };
    errors.$imports.$mock({
      './raven': fakeRaven,
    });
    sinon.stub(console, 'error');
  });

  afterEach(function () {
    console.error.restore();
    errors.$imports.$restore();
  });

  describe('#shouldIgnoreInjectionError', function () {
    const ignoredErrors = [
      'The tab was closed',
      'No tab with id 42',
      'Cannot access contents of url "file:///C:/t/cpp.pdf". ' +
        'Extension manifest must request permission to access this host.',
      'Cannot access contents of page',
      'The extensions gallery cannot be scripted.',
    ];

    const unexpectedErrors = ['SyntaxError: A typo'];

    it('should be true for "expected" errors', function () {
      ignoredErrors.forEach(function (message) {
        const error = { message: message };
        assert.isTrue(errors.shouldIgnoreInjectionError(error));
      });
    });

    it('should be false for unexpected errors', function () {
      unexpectedErrors.forEach(function (message) {
        const error = { message: message };
        assert.isFalse(errors.shouldIgnoreInjectionError(error));
      });
    });

    it("should be true for the extension's custom error classes", function () {
      const error = new errors.LocalFileError('some message');
      assert.isTrue(errors.shouldIgnoreInjectionError(error));
    });
  });

  describe('#report', function () {
    it('reports unknown errors via Raven', function () {
      const error = new Error('A most unexpected error');
      errors.report(error, 'injecting the sidebar');
      assert.calledWith(fakeRaven.report, error, 'injecting the sidebar');
    });

    it('does not report known errors via Raven', function () {
      const error = new errors.LocalFileError('some message');
      errors.report(error, 'injecting the sidebar');
      assert.notCalled(fakeRaven.report);
    });
  });
});
