/* global global */
// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
// @remove-on-eject-end

if (typeof global !== 'undefined') {
	if (typeof Promise === 'undefined') {
		// Rejection tracking prevents a common issue where React gets into an
		// inconsistent state due to an error, but it gets swallowed by a Promise,
		// and the user has no idea what causes React's erratic future behavior.
		require('promise/lib/rejection-tracking').enable();
		global.Promise = require('promise/lib/es6-extensions');
	}

	// fetch() polyfill for making API calls.
	require('whatwg-fetch');
}

if (!Math.sign) {
	Math.sign = function(x) {
		// If -0, must return -0.
		return isNaN(x) ? NaN : x < 0 ? -1 : x > 0 ? 1 : +x;
	}
}

// Common String ES6 functionalities for character values.
// Used by Enact's Moonstone library.
require('string.fromcodepoint');
require('string.prototype.codepointat');

// Object.assign() is commonly used with Enact and React.
// It will use the native implementation if it's present and isn't buggy.
Object.assign = require('object-assign');
