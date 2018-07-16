/* eslint no-var: off, no-extend-native: off */
/*
 *  polyfills.js
 *
 *  Any polyfills or code required prior to loading the app.
 */

if (!global.skipPolyfills && !global._babelPolyfill) {
	// Temporarily remap [Array].toLocaleString to [Array].toString.
	// Fixes an issue with loading the polyfills within the v8 snapshot environment
	// where toLocaleString() within the TypedArray polyfills causes snapshot failure.
	var origToLocaleString = Array.prototype.toLocaleString;
	Array.prototype.toLocaleString = Array.prototype.toString;

	// Apply Babel polyfills
	require('./babel-proxy');

	// Restore real [Array].toLocaleString for runtime usage.
	Array.prototype.toLocaleString = origToLocaleString;
}
