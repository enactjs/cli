/*
 *  babel.config.js
 *
 *  A Babel javascript configuration dynamically setup for Enact
 *  development environment on target platforms.
 */

module.exports = function(api) {
	const env = process.env.BABEL_ENV || process.env.NODE_ENV;
	const es5Standalone = process.env.ES5 && process.env.ES5 !== 'false';

	if (api && api.cache) api.cache(() => env + es5Standalone);

	return {
		presets: [
			[
				require('@babel/preset-env').default,
				{
					exclude: [
						// Exclude transforms that make all code slower
						'transform-typeof-symbol',
						// Exclude chunky/costly transforms
						'transform-regenerator',
						// Ignore web features since window and DOM is not available
						// in a V8 snapshot blob.
						// TODO: investigates ways to include but delay loading.
						'web.dom-collections.for-each',
						'web.dom-collections.iterator',
						'web.immediate',
						'web.queue-microtask',
						'web.timers',
						'web.url',
						'web.url.to-json',
						'web.url-search-params'
					],
					forceAllTransforms: es5Standalone,
					useBuiltIns: 'entry',
					corejs: 3,
					modules: false
				}
			],
			[
				require('@babel/preset-react').default,
				{
					// Adds component stack to warning messages
					// Adds __self attribute to JSX which React will use for some warnings
					development: env !== 'production' && !es5Standalone,
					// Will use the native built-in instead of trying to polyfill
					// behavior for any plugins that require one.
					useBuiltIns: true
				}
			],
			['@babel/preset-typescript']
		],
		plugins: [
			// Stage 0
			// '@babel/plugin-proposal-function-bind',

			// Stage 1
			require('@babel/plugin-proposal-export-default-from').default,
			// '@babel/plugin-proposal-logical-assignment-operators',
			// ['@babel/plugin-proposal-optional-chaining', { 'loose': false }],
			// ['@babel/plugin-proposal-pipeline-operator', { 'proposal': 'minimal' }],
			// ['@babel/plugin-proposal-nullish-coalescing-operator', { 'loose': false }],
			// '@babel/plugin-proposal-do-expressions',

			// Stage 2
			[require('@babel/plugin-proposal-decorators').default, false],
			// '@babel/plugin-proposal-function-sent',
			require('@babel/plugin-proposal-export-namespace-from').default,
			require('@babel/plugin-proposal-numeric-separator').default,
			// '@babel/plugin-proposal-throw-expressions',

			// Stage 3
			require('@babel/plugin-syntax-dynamic-import').default,
			// '@babel/plugin-syntax-import-meta',
			[require('@babel/plugin-proposal-class-properties').default, {loose: true}],
			// '@babel/plugin-proposal-json-strings'

			// Soon to be included within pre-env; include here until then
			require('@babel/plugin-proposal-optional-chaining').default,
			require('@babel/plugin-proposal-nullish-coalescing-operator').default,

			require('babel-plugin-dev-expression'),
			env === 'production' && !es5Standalone && require('@babel/plugin-transform-react-inline-elements').default
		].filter(Boolean),
		overrides: [
			{
				test: /\.tsx?$/,
				plugins: [
					[require('@babel/plugin-proposal-decorators').default, {legacy: true}]
				]
			}
		]
	};
};
