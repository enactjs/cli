var
	cp = require('child_process'),
	utils = require('../src/utils');

module.exports = function(args) {
	if(!utils.exists('./.eslintrc') && !utils.exists('./.eslintrc.js') && !utils.exists('./.eslintrc.json')) {
		args.unshift('--no-eslintrc', '--config', require.resolve('eslint-config-enact/index.js'));
		args.unshift('--ignore-pattern', 'node_modules/*');
		args.unshift('--ignore-pattern', 'build/*');
		args.unshift('--ignore-pattern', 'dist/*');
	}
	cp.fork(require.resolve('eslint/bin/eslint'), args, {env:process.env, cwd:process.cwd()});
};
