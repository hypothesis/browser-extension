import TabStore from '../../src/background/tab-store';

describe('TabStore', function () {
  let store;
  let fakeLocalStorage;

  beforeEach(function () {
    fakeLocalStorage = {
      getItem: sinon.spy(function (key) {
        return this.data[key];
      }),
      setItem: sinon.spy(),
      removeItem: sinon.spy(),
      data: {},
    };
    store = new TabStore(fakeLocalStorage);
  });

  describe('.get', function () {
    beforeEach(function () {
      fakeLocalStorage.data.state = JSON.stringify({
        1: { state: 'active' },
      });
      store.reload();
    });

    it('retrieves a key from the cache', function () {
      const value = store.get(1);
      assert.equal(value.state, 'active');
    });

    it('raises an error if the key cannot be found', function () {
      assert.throws(function () {
        store.get(100);
      });
    });
  });

  describe('.set', function () {
    it('inserts a JSON string into the store for the tab id', function () {
      const expected = JSON.stringify({
        1: { state: 'active' },
      });
      store.set(1, { state: 'active' });
      assert.calledWith(fakeLocalStorage.setItem, 'state', expected);
    });

    it('adds new properties to the serialized object with each new call', function () {
      const expected = JSON.stringify({
        1: { state: 'active' },
        2: { state: 'inactive' },
      });
      store.set(1, { state: 'active' });
      store.set(2, { state: 'inactive' });
      assert.calledWith(fakeLocalStorage.setItem, 'state', expected);
    });

    it('overrides existing properties on the serialized object', function () {
      const expected = JSON.stringify({
        1: { state: 'inactive' },
      });
      store.set(1, { state: 'active' });
      store.set(1, { state: 'inactive' });
      assert.calledWith(fakeLocalStorage.setItem, 'state', expected);
    });
  });

  describe('.unset', function () {
    beforeEach(function () {
      fakeLocalStorage.data.state = JSON.stringify({ 1: 'active' });
      store.reload();
    });

    it('removes a property from the serialized object', function () {
      store.unset(1);
      assert.calledWith(fakeLocalStorage.setItem, 'state', '{}');
    });
  });

  describe('.all', function () {
    beforeEach(function () {
      fakeLocalStorage.data.state = JSON.stringify({ 1: { state: 'active' } });
      store.reload();
    });

    it('returns all items as an Object', function () {
      const all = store.all();
      assert.deepEqual(all, { 1: { state: 'active' } });
    });
  });
});
