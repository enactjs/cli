var cp = require('child_process');

module.exports = function(args) {
	cp.fork(require.resolve('eslint/bin/eslint'), args, {env:process.env, cwd:process.cwd()});
};
