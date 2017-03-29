var helper = require('./util/config-helper');

module.exports = function(config) {
	// Allow Uglify's optimizations/debug-code-removal but don't minify
	var uglifyPlugin = helper.getPluginByName(config, 'UglifyJsPlugin');
	if(uglifyPlugin) {
		uglifyPlugin.options.mangle = false;
		uglifyPlugin.options.beautify = true;
		uglifyPlugin.options.output.comments = true;
	}
	config.output.pathinfo = true;
};
