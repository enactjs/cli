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

if (typeof window === 'object') {
	if (typeof Promise === 'undefined' && typeof window === 'object') {
		// Rejection tracking prevents a common issue where React gets into an
		// inconsistent state due to an error, but it gets swallowed by a Promise,
		// and the user has no idea what causes React's erratic future behavior.
		require('promise/lib/rejection-tracking').enable();
		window.Promise = require('promise/lib/es6-extensions');
	}

	// fetch() polyfill for making API calls.
	require('whatwg-fetch');
}

// Object.assign() is commonly used with Enact and React.
// It will use the native implementation if it's present and isn't buggy.
Object.assign = require('object-assign');
