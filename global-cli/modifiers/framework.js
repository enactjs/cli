var
	path = require('path'),
	glob = require('glob'),
	exists = require('path-exists').sync,
	snapshotSetup = require('./snapshot'),
	helper = require('./util/config-helper'),
	EnactFrameworkPlugin = require('./util/EnactFrameworkPlugin');

module.exports = function(config, opts) {
	// Form list of framework entries; Every @enact/* js file as well as react/react-dom
	var entry = glob.sync('@enact/**/*.@(js|jsx|es6)', {
		cwd: path.resolve('./node_modules'),
		nodir: true,
		ignore: [
			'./webpack.config.js',
			'./.eslintrc.js',
			'./karma.conf.js',
			'./build/**/*.*',
			'./dist/**/*.*',
			'./node_modules/**/*.*',
			'**/tests/*.js'
		]
	}).concat(['react', 'react-dom']);
	if(!exists(path.join(process.cwd(), 'node_modules', 'react-dom', 'lib', 'ReactPerf.js'))) {
		entry.push('react/lib/ReactPerf');
	} else {
		entry.push('react-dom/lib/ReactPerf');
	}
	config.entry = {enact:entry};

	// Use universal module definition to allow usage and name as 'enact_framework'
	config.output.library = 'enact_framework';
	config.output.libraryTarget = 'umd';

	// Modify the iLib plugin options to skip './resources' detection/generation
	var ilibPlugin = helper.getPluginByName(config, 'ILibPlugin');
	if(ilibPlugin) {
		ilibPlugin.options.create = false;
		ilibPlugin.options.resources = false;
	}

	// Remove the HTML generation plugin and webOS-meta plugin
	var unneeded = ['HtmlWebpackPlugin', 'WebOSMetaPlugin'];
	for(var i=0; i<unneeded.length; i++) {
		helper.removePlugin(config, unneeded[i]);
	}

	// Add the framework plugin to build in an externally accessible manner
	config.plugins.push(new EnactFrameworkPlugin());

	if(opts.snapshot) {
		snapshotSetup(config, {framework:true});
	}
};
