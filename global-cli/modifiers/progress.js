var ProgressStatusPlugin = require('./util/ProgressStatusPlugin');

module.exports = function(config) {
	config.plugins.push(new ProgressStatusPlugin({
		bar: ' ',
		// Cyan on windows is hard to see against the gray
		barStyle: (process.platform==='win32') ? 'bgWhite' : 'bgCyan',
		barBg: ' ',
		barBgStyle: 'bgBlack',
		frameLeft: '',
		frameRight: ''
	}));
};
