var
	path = require('path'),
	exists = require('path-exists').sync,
	externalsSetup = require('./externals'),
	frameworkSetup = require('./framework'),
	isomorphicSetup = require('./isomorphic'),
	statsSetup = require('./stats'),
	unmangledSetup = require('./unmangled');

module.exports = {
	apply: function(config, opts) {
		if(opts.production && !opts['minify']) {
			unmangledSetup(config, opts);
		}

		if(opts.framework) {
			frameworkSetup(config, opts);
		} else {
			// Backwards compatibility for <15.4.0 React
			if(!exists(path.join(process.cwd(), 'node_modules', 'react-dom', 'lib', 'ReactPerf.js'))) {
				config.resolve.alias['react-dom/lib/ReactPerf'] = 'react/lib/ReactPerf';
			}
			if(opts.isomorphic) {
				isomorphicSetup(config, opts);
			}
			if(opts.externals) {
				externalsSetup(config, opts);
			}
		}

		if(opts.stats) {
			statsSetup(config, opts);
		}
	},
	externals: externalsSetup,
	framework: frameworkSetup,
	isomorphic: isomorphicSetup,
	stats: statsSetup,
	unmangled: unmangledSetup
};
