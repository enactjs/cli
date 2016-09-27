var
	cp = require('child_process'),
	utils = require('../src/utils');

module.exports = function(args) {
	if(!utils.exists('./webpack.config.js')) {
		args.unshift('--config', require.resolve('./internal/webpack.js'));
	}
	var child = cp.fork(require.resolve('webpack-dev-server/bin/webpack-dev-server'), args, {env:process.env, cwd:process.cwd()});
	child.on('close', function(code, signal) {
		process.exit(code);
	});
};
