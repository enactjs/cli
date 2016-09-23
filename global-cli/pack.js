var
	cp = require('child_process'),
	utils = require('../src/utils');

module.exports = function(args) {
	if(!utils.exists('./webpack.config.js')) {
		args.unshift('--config', require.resolve('./internal/webpack.js'));
	}
	cp.fork(require.resolve('webpack/bin/webpack'), args, {env:process.env, cwd:process.cwd()});
};
