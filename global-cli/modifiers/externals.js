var
	fs = require('fs'),
	exists = require('path-exists').sync,
	EnactFrameworkRefPlugin = require('./util/EnactFrameworkRefPlugin');

module.exports = function(config, opts) {
	var resBundle = './resources/ilibmanifest.json';
	if(!exists(resBundle)) {
		if(!exists('./resources')) {
			fs.mkdirSync('./resources');
		}
		fs.writeFileSync(resBundle, JSON.stringify({files:[]}, null, '\t'), {encoding:'utf8'});
	}
	config.entry.main.splice(config.entry.main.length-1, 0, resBundle);

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
