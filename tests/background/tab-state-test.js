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

    it('queries the service and sets the annotation count after waiting for a period of 3000ms', async () => {
      const testValue = 42;
      getStub.resolves(testValue);
      const tabState = new TabState({ 1: { state: states.ACTIVE } });

      const promise = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(1010);
      await promise;
      assert.called(getStub);
      assert.equal(tabState.getState(1).annotationCount, testValue);
    });

    it('cancels the first query (during waiting period) when the service is called two consecutive times for the same tab', async () => {
      const testValue = 42;
      getStub.resolves(testValue);
      const tabState = new TabState({ 1: { state: states.ACTIVE } });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(800); // promise 1 is still waiting when promise2 is called
      const promise2 = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(2300);
      await promise1;
      assert.strictEqual(tabState.getState(1).annotationCount, 0);

      await promise2;
      assert.calledOnce(getStub);
      assert.strictEqual(tabState.getState(1).annotationCount, testValue);
    });

    it('waits for a maximum of 3000 ms when a number of concurrent requests', async () => {
      const testValue = 42;
      getStub.resolves(testValue);
      const tabState = new TabState({ 1: { state: states.ACTIVE } });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise2 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise3 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise4 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise5 = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(3010); // promise 1-4 are cancelled, while promise 4 is resolved in no more than 3000 ms
      await promise1;
      await promise2;
      assert.strictEqual(tabState.getState(1).annotationCount, 0);
      await promise3;
      await promise4;
      await promise5;
      assert.calledOnce(getStub);
      assert.strictEqual(tabState.getState(1).annotationCount, testValue);
    });

    it('cancels the first query (during the fetch request) when the service is called two consecutive times for the same tab', async () => {
      const testValue = 42;

      // Takes 2000ms in returning a the response
      getStub.returns(
        new Promise(resolve => setTimeout(() => resolve(testValue), 2000))
      );

      const tabState = new TabState({ 1: { state: states.ACTIVE } });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(1010); // promise1 finished waiting and it is fetching the request
      const promise2 = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(1010 + 2000);

      await promise1;
      assert.calledTwice(getStub); // request is not cancelled
      assert.equal(tabState.getState(1).annotationCount, 0);
      await promise2;
      assert.equal(tabState.getState(1).annotationCount, testValue);
    });

    it('processes two consecutive request to the service if the requests are for different tabs', async () => {
      const testValue = 42;
      getStub.resolves(testValue);

      const tabState = new TabState({
        1: { state: states.ACTIVE },
        2: { state: states.ACTIVE },
      });

      const promise1 = tabState.updateAnnotationCount(1, 'foobar.com');
      const promise2 = tabState.updateAnnotationCount(2, 'foobar.com');
      clock.tick(1010);
      await promise1;
      assert.strictEqual(tabState.getState(1).annotationCount, testValue);
      await promise2;
      assert.calledTwice(getStub);
      assert.strictEqual(tabState.getState(2).annotationCount, testValue);
    });

    it('sets the annotation count to zero if badge request is rejected', async () => {
      getStub.rejects('some error condition');

      const tabState = new TabState({
        1: { state: states.ACTIVE },
      });

      const promise = tabState.updateAnnotationCount(1, 'foobar.com');
      clock.tick(3010);
      await promise;
      assert.strictEqual(tabState.getState(1).annotationCount, 0);
    });
  });
});
