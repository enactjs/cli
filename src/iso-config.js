var
	path = require('path'),
	config = require('./common-config'),
	mixin = require('./mixin');

module.exports = function(opts) {
	var common = config.common({ri: opts.ri, noEmit: true});
	return mixin(common, {
		entry: {
			prerender:path.join(__dirname, 'prerender.js')
		},
		output: {
			libraryTarget: 'commonjs2',
			filename: 'prerender.js'
		},
		target: 'node',
		resolve: {
			alias: {
				'prerender-target':path.join(process.cwd(), opts.prerender),
				'babel-polyfill':require.resolve('babel-polyfill')
			}
		}
	});
};
