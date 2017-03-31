var BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = function(config) {
	config.plugins.push(new BundleAnalyzerPlugin({
		analyzerMode: 'static',
		reportFilename: 'stats.html',
		openAnalyzer: false
	}));
};
