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

    fakeLocalStorage.data.state = JSON.stringify({
      1: { state: 'active' },
    });
    store.reload([1]);
  });

  describe('.reload', () => {
    it('ignores tab information that are present in the storage but is not requested at reload', () => {
      fakeLocalStorage.data.state = JSON.stringify({
        1: { state: 'active', annotationCount: 3 },
        3: { state: 'inactive', annotationCount: 3 },
      });
      store.reload([1, 10]);

      assert.deepEqual(store.all(), {
        1: { state: 'active', annotationCount: 3 },
      });
    });

    it('returns empty object if an error is encountered while loading', () => {
      fakeLocalStorage.data.state = 'not valid JSON';
      store.reload([1]);
      assert.deepEqual(store.all(), {});
    });
  });

  describe('.get', function () {
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
    it('removes a property from the serialized object', function () {
      store.unset(1);
      assert.calledWith(fakeLocalStorage.setItem, 'state', '{}');
    });
  });

  describe('.all', function () {
    it('returns all items as an Object', function () {
      const all = store.all();
      assert.deepEqual(all, { 1: { state: 'active' } });
    });
  });
});
