import TabState, { $imports } from '../../src/background/tab-state';

describe('TabState', () => {
  const states = TabState.states;

  let state;
  let onChange;

  beforeEach(() => {
    onChange = sinon.spy();
    state = new TabState(
      {
        1: { state: states.ACTIVE },
      },
      onChange
    );
  });

  it('can be initialized without any default state', () => {
    assert.doesNotThrow(() => {
      state = new TabState(null, onChange);
      state.isTabActive(1);
    });
  });

  it('can be initialized without an onchange callback', () => {
    assert.doesNotThrow(() => {
      state = new TabState();
      state.isTabActive(1);
    });
  });

  describe('#load', () => {
    it('replaces the current tab states with a new object', () => {
      state.load({ 2: { state: states.INACTIVE } });
      // `load` (re)sets all tabs to their default state, which is inactive
      assert.equal(state.isTabActive(1), false);
      assert.equal(state.isTabInactive(2), true);
    });
  });

  describe('#activateTab', () => {
    it('sets the state for the tab id provided', () => {
      state.activateTab(2);
      assert.equal(state.isTabActive(2), true);
    });

    it('triggers an onchange handler', () => {
      state.activateTab(2);
      assert.calledWith(onChange, 2, sinon.match({ state: states.ACTIVE }));
    });
  });

  describe('#deactivateTab', () => {
    it('sets the state for the tab id provided', () => {
      state.deactivateTab(2);
      assert.equal(state.isTabInactive(2), true);
    });

    it('triggers an onchange handler', () => {
      state.deactivateTab(2);
      assert.calledWith(onChange, 2, sinon.match({ state: states.INACTIVE }));
    });
  });

  describe('#errorTab', () => {
    it('sets the state for the tab id provided', () => {
      state.errorTab(2);
      assert.equal(state.isTabErrored(2), true);
    });

    it('triggers an onchange handler', () => {
      state.errorTab(2);
      assert.calledWith(onChange, 2, sinon.match({ state: states.ERRORED }));
    });
  });

  describe('#clearTab', () => {
    it('removes the state for the tab id provided', () => {
      state.clearTab(1);
      assert.equal(
        state.isTabActive(1),
        false,
        'expected isTabActive to return false'
      );
      assert.equal(
        state.isTabInactive(1),
        true,
        'expected isTabInactive to return true'
      );
      assert.equal(
        state.isTabErrored(1),
        false,
        'expected isTabInactive to return false'
      );
    });

    it('triggers an onchange handler', () => {
      state.clearTab(1);
      assert.calledWith(onChange, 1, undefined);
    });
  });

  describe('#isTabActive', () => {
    it('returns true if the tab is active', () => {
      state.activateTab(1);
      assert.equal(state.isTabActive(1), true);
    });
  });

  describe('#isTabInactive', () => {
    it('returns true if the tab is inactive', () => {
      state.deactivateTab(1);
      assert.equal(state.isTabInactive(1), true);
    });
  });

  describe('#isTabErrored', () => {
    it('returns true if the tab is errored', () => {
      state.errorTab(1, new Error('Some error'));
      assert.equal(state.isTabErrored(1), true);
    });
  });

  describe('#setState', () => {
    it('clears the error when not errored', () => {
      state.errorTab(1, new Error('Some error'));
      assert.ok(state.getState(1).error instanceof Error);
      state.setState(1, { state: states.INACTIVE });
      assert.notOk(state.getState(1).error);
    });
  });

  describe('#updateAnnotationCount', () => {
    let clock;
    let getStub;
    const INITIAL_WAIT_MS = 1000;
    const MAX_WAIT_MS = 3000;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
      getStub = sinon.stub();
      $imports.$mock({
        './uri-info': {
          getAnnotationCount: getStub,
        },
      });
    });

    afterEach(() => {
      $imports.$restore();
      clock.restore();
    });

    it(`queries the service and sets the annotation count after waiting for a period of ${INITIAL_WAIT_MS}ms`, async () => {
      const testValue = 42;
      getStub.resolves(testValue);
      const tabState = new TabState({ 1: { state: states.ACTIVE } });

      const promise = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(INITIAL_WAIT_MS);

      await promise;
      assert.called(getStub);
      assert.equal(tabState.getState(1).annotationCount, testValue);
    });

    it(`resolves last request after a maximum of ${MAX_WAIT_MS}ms when several requests are made in succession to the service`, async () => {
      const testValue = 42;
      getStub.resolves(testValue);
      const tabState = new TabState({ 1: { state: states.ACTIVE } });

      // Simulate several URL changes in rapid succession.
      const start = Date.now();
      let done;
      for (let i = 0; i < 10; i++) {
        done = tabState.updateAnnotationCount(1, 'foobar.com');
      }
      await clock.runToLastAsync();
      await done;
      const end = Date.now();

      // all pending requests are canceled except the last one which is resolved in no more than MAX_WAIT_MS
      assert.equal(end - start, MAX_WAIT_MS);
      assert.calledOnce(getStub);
      assert.equal(tabState.getState(1).annotationCount, testValue);
    });

    it('cancels the first query (during waiting stage) when the service is called two consecutive times for the same tab', async () => {
      const initialValue = 33;
      const testValue = 42;
      getStub.resolves(testValue);
      const tabState = new TabState({
        1: { state: states.ACTIVE, annotationCount: initialValue },
      });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise2 = tabState.updateAnnotationCount(1, 'foobar.com'); // promise 1 is still waiting when promise2 is called
      assert.equal(tabState.getState(1).annotationCount, initialValue);
      clock.tick(MAX_WAIT_MS);

      await promise1;
      await promise2;
      assert.calledOnce(getStub);
      assert.equal(tabState.getState(1).annotationCount, testValue);
    });

    it('cancels the first query (during the fetch stage) when the service is called two consecutive times for the same tab', async () => {
      const initialValue = 33;
      const testValue = 42;

      const WAIT_FETCH = 2000; // Takes 2000ms to return a response
      getStub.returns(
        new Promise(resolve => setTimeout(() => resolve(testValue), WAIT_FETCH))
      );

      const tabState = new TabState({
        1: { state: states.ACTIVE, annotationCount: initialValue },
      });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(INITIAL_WAIT_MS); // promise1 finished waiting and it is fetching the request
      const promise2 = tabState.updateAnnotationCount(1, 'foobar.com');
      assert.equal(tabState.getState(1).annotationCount, initialValue);
      clock.tick(MAX_WAIT_MS + WAIT_FETCH);

      await promise1;
      await promise2;
      assert.calledTwice(getStub); // request is not cancelled
      assert.equal(tabState.getState(1).annotationCount, testValue);
    });

    it('resolves two concurrent requests if they are made for different tabs', async () => {
      const testValue = 42;
      getStub.resolves(testValue);

      const tabState = new TabState({
        1: { state: states.ACTIVE },
        2: { state: states.ACTIVE },
      });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise2 = tabState.updateAnnotationCount(2, 'foobar.com');
      clock.tick(INITIAL_WAIT_MS);

      await promise1;
      await promise2;
      assert.calledTwice(getStub);
      assert.equal(tabState.getState(1).annotationCount, testValue);
      assert.equal(tabState.getState(2).annotationCount, testValue);
    });

    it('sets the annotation count to zero if badge request is rejected', async () => {
      getStub.rejects('some error condition');

      const tabState = new TabState({
        1: { state: states.ACTIVE, annotationCount: 33 },
      });

      const promise = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(MAX_WAIT_MS);

      await promise;
      assert.equal(tabState.getState(1).annotationCount, 0);
    });
  });
});
