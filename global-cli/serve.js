var cp = require('child_process');

module.exports = function(args) {
	args.unshift('--config', require.resolve('./internal/webpack.js'));
	cp.fork(require.resolve('webpack-dev-server/bin/webpack-dev-server'), args, {env:process.env, cwd:process.cwd()});
};
