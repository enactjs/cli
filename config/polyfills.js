/* eslint no-var: off */
/*
 *  polyfills.js
 *
 *  A collections of polyfills required prior to loading the app.
 */

// Temporarily remap [Array].toLocaleString to [Array].toString.
// Fixes an issue with loading the polyfills within the v8 snapshot environment
// where toLocaleString() within the TypedArray polyfills causes snapshot failure.
var origToLocaleString = Array.prototype.toLocaleString;
Array.prototype.toLocaleString = Array.prototype.toString;

require('@babel/polyfill');

// Restore real [Array].toLocaleString for runtime usage.
Array.prototype.toLocaleString = origToLocaleString;
