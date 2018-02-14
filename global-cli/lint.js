const cp = require('child_process');
const minimist = require('minimist');

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
	console.log('    -s, --strict      Scan with strict eslint config');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function api({strict = false, local = false, eslintArgs = []} = {}) {
	let args = [];
	if(strict) {
		args.push('--no-eslintrc', '--config', require.resolve('eslint-config-enact/strict'));
	} else if(!local) {
		args.push('--no-eslintrc', '--config', require.resolve('eslint-config-enact'));
	}
	args.push('--ignore-pattern', 'node_modules/*');
	args.push('--ignore-pattern', 'build/*');
	args.push('--ignore-pattern', 'dist/*');
	if(eslintArgs.length) {
		args = args.concat(eslintArgs);
	} else {
		args.push('.');
	}
	return new Promise((resolve, reject) => {
		const child = cp.fork(require.resolve('eslint/bin/eslint'), args,
				{env:process.env, cwd:process.cwd()});
		child.on('close', code => {
			if(code!==0) {
				reject()
			} else {
				resolve();
			}
		});
	});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['local', 'strict', 'help'],
		alias: {l:'local', s:'strict', h:'help'}
	});
	opts.help && displayHelp();

	api({strict:opts.strict, local:opts.local, eslintArgs:opts._}).catch(() => {
		process.exit(1);
	});
}

module.exports = {api, cli};
