/*
 *  .babelrc.js
 *
 *  A Babel javascript configuration dynamically setup for Enact
 *  development environment on target platforms.
 */

const app = require('@enact/dev-utils').optionParser;

const env = process.env.BABEL_ENV || process.env.NODE_ENV;
const es5Standalone = process.env.ES5 && process.env.ES5 !== 'false';

module.exports = {
	presets: [
		[
			'@babel/preset-env',
			{
				exclude: ['transform-regenerator', 'web.dom.iterable', 'web.timers', 'web.immediate'],
				forceAllTransforms: es5Standalone,
				useBuiltIns: 'entry',
				modules: false
			}
		],
		[
			'@babel/preset-react',
			{
				// Adds component stack to warning messages
				// Adds __self attribute to JSX which React will use for some warnings
	 			development: env !== 'production' && !es5Standalone,
				// Will use the native built-in instead of trying to polyfill
				// behavior for any plugins that require one.
				useBuiltIns: true
			}
		],
		[
			'@babel/preset-typescript'
		]
	],
	plugins: [
		// Stage 0
		//'@babel/plugin-proposal-function-bind',

		// Stage 1
		'@babel/plugin-proposal-export-default-from',
		//'@babel/plugin-proposal-logical-assignment-operators',
		//['@babel/plugin-proposal-optional-chaining', { 'loose': false }],
		//['@babel/plugin-proposal-pipeline-operator', { 'proposal': 'minimal' }],
		//['@babel/plugin-proposal-nullish-coalescing-operator', { 'loose': false }],
		//'@babel/plugin-proposal-do-expressions',

		// Stage 2
		//['@babel/plugin-proposal-decorators', { 'legacy': true }],
		//'@babel/plugin-proposal-function-sent',
		'@babel/plugin-proposal-export-namespace-from',
		//'@babel/plugin-proposal-numeric-separator',
		//'@babel/plugin-proposal-throw-expressions',

		// Stage 3
		'@babel/plugin-syntax-dynamic-import',
		//'@babel/plugin-syntax-import-meta',
		['@babel/plugin-proposal-class-properties', { 'loose': true }],
		//'@babel/plugin-proposal-json-strings'

		'dev-expression',
		env === 'production' && !es5Standalone && '@babel/plugin-transform-react-inline-elements'
	].filter(Boolean)
};
