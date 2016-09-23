var
	path = require('path'),
	glob = require('glob'),
	NamedLibraryPlugin = require('./NamedLibraryPlugin'),
	config = require('./common-config'),
	mixin = require('./mixin');

module.exports = function(opts) {
	opts.name = opts.name || 'mylib';
	var common = config.common({ri: opts.ri, css: opts.name + '.css'});

	return mixin(common, {
		entry: [glob.sync('./**/*.@(js|jsx|es6)', {
			nodir:true,
			ignore:[
				'./webpack.config.js',
				'./.eslintrc.js',
				'./karma.conf.js',
				'./build/**/*.*',
				'./dist/**/*.*',
				'./node_modules/**/*.*',
				'./**/tests/*.js'
			]
		})],
		// TODO: exclude vendor dependencies, namedlibraryrefplugin for enyo dependencies
		output: {
			filename: opts.name + ".js",
			library: opts.name
		},
		plugins: [
			new NamedLibraryPlugin()
		]
	});
};
