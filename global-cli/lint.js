var	cp = require('child_process');

module.exports = function(args) {
	args.unshift('--no-eslintrc', '--config', require.resolve('eslint-config-enact/index.js'));
	args.unshift('--ignore-pattern', 'node_modules/*');
	args.unshift('--ignore-pattern', 'build/*');
	args.unshift('--ignore-pattern', 'dist/*');
	var child = cp.fork(require.resolve('eslint/bin/eslint'), args, {env:process.env, cwd:process.cwd()});
	child.on('close', function(code, signal) {
		process.exit(code);
	});
};
