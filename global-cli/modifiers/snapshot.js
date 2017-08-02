const
	path = require('path'),
	fs = require('fs'),
	helper = require('./util/config-helper'),
	SnapshotPlugin = require('./util/SnapshotPlugin'),
	IgnorePlugin = require('webpack').IgnorePlugin;

module.exports = function(config, opts) {
	if(!opts.framework) {
		// Update HTML webpack plugin to mark it as snapshot mode for the isomorphic template
		const htmlPlugin = helper.getPluginByName(config, 'HtmlWebpackPlugin');
		if(htmlPlugin) {
			htmlPlugin.options.snapshot = true;
		}

		// Snapshot helper API for the transition from v8 snapshot into the window
		config.entry.main.splice(-1, 0, require.resolve('./util/snapshot-helper'));
	}

	// Include plugin to attempt generation of v8 snapshot binary if V8_MKSNAPSHOT env var is set
	config.plugins.push(new SnapshotPlugin({
		target: (opts.framework ? 'enact.js' : 'main.js')
		// Disabled temporarily until effectiveness is proven
		// append: (opts.framework ? '\nenact_framework.load();\n' : undefined)
	}));

	config.resolve.alias['SNAPSHOT_REACT_DOM'] = path.resolve(path.join(process.cwd(),
			'node_modules', 'react-dom'));
	config.resolve.alias['react-dom'] = require.resolve('./util/snapshot-helper');

	const ssHelperDeps = [
		'@enact/i18n',
		'@enact/moonstone'
	];
	for(let i=0; i<ssHelperDeps.length; i++) {
		if(!fs.existsSync(path.join(process.cwd(), 'node_modules', ssHelperDeps[i]))) {
			config.plugins.push(new IgnorePlugin(new RegExp(ssHelperDeps[i])));
		}
	}
};
