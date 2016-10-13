var
	cp = require('child_process'),
	minimist = require('minimist');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact lint [options] [<target>]');
	console.log();
	console.log('  Arguments');
	console.log('    target            Optional target file or directory');
	console.log('                          (default: cwd)');
	console.log();
	console.log('  Options');
	console.log('    -l, --local       Scan with local eslint config');
	console.log('    -f, --framework   Scan with strict framework config');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

module.exports = function(args) {
	var opts = minimist(args, {
		boolean: ['l', 'local', 'f', 'framework', 'h', 'help'],
		alias: {l:'local', f:'framework', h:'help'}
	});
	opts.help && displayHelp();

	var eslintArgs = [];
	if(opts.framework) {
		eslintArgs.push('--no-eslintrc', '--config', require.resolve('eslint-config-enact-internal/index.js'));
	} else if(!opts.local) {
		eslintArgs.push('--no-eslintrc', '--config', require.resolve('eslint-config-enact/index.js'));
	}
	eslintArgs.push('--ignore-pattern', 'node_modules/*');
	eslintArgs.push('--ignore-pattern', 'build/*');
	eslintArgs.push('--ignore-pattern', 'dist/*');
	eslintArgs.push(opts._[0] || '.');
	var child = cp.fork(require.resolve('eslint/bin/eslint'), eslintArgs, {env:process.env, cwd:process.cwd()});
	child.on('close', function(code, signal) {
		process.exit(code);
	});
};
