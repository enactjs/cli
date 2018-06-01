/*
 *  babel-proxy.js
 *
 *  For babel-preset-env with "useBuiltin":"entry", it requires that the
 *  require('@babel/polfill') expression be at the module level for it to
 *  be transpiled into the individual core-js polyfills. This proxy module
 *  allows for dynamic babel-polyfill usage while still using the core-js
 *  transforms.
 */

// Apply Babel polyfills
require('@babel/polyfill');

// Manually set global._babelPolyfill for situations where babel-preset-env
// transpiles into individual core-js polyfills, to avoid repeated usage.
global._babelPolyfill = true;
