var ProgressStatusPlugin = require('./util/ProgressStatusPlugin');

module.exports = function(config) {
	config.plugins.push(new ProgressStatusPlugin({
		bar: ' ',
		barStyle: 'bgCyan',
		barBg: ' ',
		barBgStyle: 'bgBlack',
		frameLeft: '',
		frameRight: ''
	}));
};
