var cp = require('child_process');

module.exports = function(args) {
	cp.fork(require.resolve('karma/bin/karma'), args, {env:process.env, cwd:process.cwd()});
};
