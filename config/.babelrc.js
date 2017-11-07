/*
 *  .babelrc.js
 *
 *  A forward-compatible Babel javascript configuration dynamically setup
 *  for Enact development environment on target platforms.
 */

let {browsers, node} = require('@enact/dev-utils/option-parser');
const env = process.env.BABEL_ENV || process.env.NODE_ENV;

if(env === 'test') {
	browsers = [];
	node = 'current';
}

module.exports = {
	presets: [
		['env', {
			targets: Object.assign({uglify:true},
					browsers && {browsers:browsers},
					node && {node: node}),
			exclude: ['transform-regenerator', 'web.dom.iterable', 'web.timers', 'web.immediate'],
			useBuiltIns: true,
			modules: (env === 'test') && 'commonjs'
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
