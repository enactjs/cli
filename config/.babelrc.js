/*
 *  .babelrc.js
 *
 *  A forward-compatible Babel javascript configuration dynamically setup
 *  for Enact development environment on target platforms.
 */

const app = require('@enact/dev-utils/option-parser');

const env = process.env.BABEL_ENV || process.env.NODE_ENV;
const es5Standalone = process.env.ES5 && process.env.ES5 !== 'false';

module.exports = {
	presets: [
		['env', {
			targets: Object.assign({uglify:es5Standalone},
					app.browsers && {browsers:app.browsers},
					app.node && {node: app.node}),
			exclude: ['transform-regenerator', 'web.dom.iterable', 'web.timers', 'web.immediate'],
			useBuiltIns: !es5Standalone,
			modules: false
		}],
		'stage-0',
		'react'
	],
	plugins: [
		'dev-expression',
		env !== 'production' && 'transform-react-jsx-self',
		env !== 'production' && 'transform-react-jsx-source',
		env === 'production' && 'transform-react-inline-elements'
	].filter(Boolean)
};
