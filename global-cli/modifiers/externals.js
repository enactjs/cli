var
	fs = require('fs'),
	exists = require('path-exists').sync,
	EnactFrameworkRefPlugin = require('./util/EnactFrameworkRefPlugin');

module.exports = function(config, opts) {
	// Add the reference plugin so the app uses the external framework
	config.plugins.push(new EnactFrameworkRefPlugin({
		name: 'enact_framework',
		libraries: ['@enact', 'react', 'react-dom'],
		external: {
			path: opts.externals,
			inject: opts['externals-inject'] || opts.inject,
			snapshot: opts.snapshot
		}
	}));
};
