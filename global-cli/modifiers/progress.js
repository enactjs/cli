var ProgressStatusPlugin = require('./util/ProgressStatusPlugin');

module.exports = function(config) {
	config.plugins.push(new ProgressStatusPlugin({
		bar: 'cyan',
		barBg: 'black'
	}));
};
