'use strict';

// ES2015 polyfills
require('core-js/es6/promise');
require('core-js/fn/array/find');
require('core-js/fn/array/find-index');
require('core-js/fn/array/from');
require('core-js/fn/object/assign');

// Include URL polyfill because PhantomJS 2.x has a broken URL
// constructor. See https://github.com/hypothesis/client/pull/16
require('js-polyfills/url');

// Additional polyfills for newer features.
// Be careful that any polyfills used here match what is used in the
// app itself.
require('../src/common/polyfills');
