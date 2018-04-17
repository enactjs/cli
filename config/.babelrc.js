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
				targets: Object.assign({}, app.browsers && {browsers: app.browsers}, app.node && {node: app.node}),
				exclude: ['transform-regenerator', 'web.dom.iterable', 'web.timers', 'web.immediate'],
				forceAllTransforms: es5Standalone,
				useBuiltIns: 'entry',
				modules: false
			}
		],
		'@babel/preset-stage-0',
		'@babel/preset-react'
	],
	plugins: [
		'dev-expression',
		env !== 'production' && !es5Standalone && '@babel/plugin-transform-react-jsx-self',
		env !== 'production' && !es5Standalone && '@babel/plugin-transform-react-jsx-source',
		env === 'production' && !es5Standalone && '@babel/plugin-transform-react-inline-elements'
	].filter(Boolean)
};
