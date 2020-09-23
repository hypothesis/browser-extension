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
    afterEach(() => {
      $imports.$restore();
    });

    it('queries the service and sets the annotation count', () => {
      const testValue = 42;
      var getStub = sinon.stub().returns(Promise.resolve(testValue));
      $imports.$mock({
        './uri-info': {
          getAnnotationCount: getStub,
        },
      });
      var tabState = new TabState({ 1: { state: states.ACTIVE } });
      return tabState.updateAnnotationCount(1, 'foobar.com').then(() => {
        assert.called(getStub);
        assert.equal(tabState.getState(1).annotationCount, testValue);
      });
    });
  });
});
