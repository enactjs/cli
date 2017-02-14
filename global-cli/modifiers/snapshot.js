var
	path = require('path'),
	fs = require('fs'),
	exists = require('path-exists').sync,
	helper = require('./util/config-helper'),
	SnapshotPlugin = require('./util/SnapshotPlugin');

module.exports = function(config, opts) {
	if(!opts.framework) {
		// Update HTML webpack plugin to mark it as snapshot mode for the isomorphic template
		var htmlPlugin = helper.getPluginByName(config, 'HtmlWebpackPlugin');
		if(htmlPlugin) {
			htmlPlugin.options.snapshot = true;
		}

		// fallback alias for fbjs in Node 4.x dependency tree
		var fbjs = path.join(process.cwd(), 'node_modules', 'react', 'node_modules', 'fbjs');
		if(exists(fbjs)) {
			config.resolve.alias.fbjs = fbjs;
		}
		// Snapshot helper API for the transition from v8 snapshot into the window
		config.entry.main.splice(-1, 0, require.resolve('./util/snapshot-helper'));

		// Expose iLib locale utility function module so we can update the locale on page load, if used
		var babel = helper.findLoader(config, 'babel');
		config.module.loaders.splice((babel>=0 ? babel : 0), 0, {
			test: fs.realpathSync(path.join(process.cwd(), 'node_modules', '@enact', 'i18n', 'src', 'locale.js')),
			loader: 'expose?iLibLocale'
		});
	}

	// Include plugin to attempt generation of v8 snapshot binary if V8_MKSNAPSHOT env var is set
	config.plugins.push(new SnapshotPlugin({
		target: (opts.framework ? 'enact.js' : 'main.js')
		// Disabled temporarily until effectiveness is proven
		//append: (opts.framework ? '\nenact_framework.load();\n' : undefined)
	}));
};
