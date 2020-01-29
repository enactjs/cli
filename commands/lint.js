/* eslint-env node, es6 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const spawn = require('cross-spawn');
const glob = require('glob');
const minimist = require('minimist');
const resolver = require('resolve');
const {packageRoot} = require('@enact/dev-utils');

const globOpts = {
	ignore: ['**/node_modules/**', 'build/**', '**/dist/**', 'coverage/**', 'tests/**'],
	nodir: true
};

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact lint';

	console.log('  Usage');
	console.log(`    ${e} [options] [<target>]`);
	console.log();
	console.log('  Arguments');
	console.log('    target            Optional target file or directory');
	console.log('                          (default: cwd)');
	console.log();
	console.log('  Options');
	console.log('    -l, --local       Scan with local eslint config');
	console.log('    -s, --strict      Scan with strict eslint config');
	console.log('    -f, --fix         Attempt to fix viable problems');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function shouldESLint() {
	return glob.sync('**/*.+(js|jsx)', globOpts).length > 0;
}

function eslint({strict = false, local = false, fix = false, eslintArgs = []} = {}) {
	let args = [];
	if (strict) {
		args.push('--no-eslintrc', '--config', require.resolve('eslint-config-enact/strict'));
	} else if (!local) {
		args.push('--no-eslintrc', '--config', require.resolve('eslint-config-enact'));
	}
	args.push('--ignore-pattern', '**/node_modules/*');
	args.push('--ignore-pattern', 'build/*');
	args.push('--ignore-pattern', '**/dist/*');
	args.push('--ignore-pattern', 'coverage/*');
	if (!local) {
		args.push('--ignore-pattern', 'tests/*');
	}
	if (fix) args.push('--fix');
	if (eslintArgs.length) {
		args = args.concat(eslintArgs);
	} else {
		args.push('.');
	}
	return new Promise((resolve, reject) => {
		const opts = {env: process.env, cwd: process.cwd()};
		const child = cp.fork(require.resolve('eslint/bin/eslint'), args, opts);
		child.on('close', code => {
			if (code !== 0) {
				reject();
			} else {
				resolve();
			}
		});
	});
}

function tslintBin(context) {
	try {
		resolver.sync('tslint', {basedir: context});
		return path.join(context, 'node_modules', '.bin', 'tslint');
	} catch (e) {
		return 'tslint';
	}
}

function shouldTSLint(context) {
	if (glob.sync('**/*.+(ts|tsx)', globOpts).length > 0) {
		try {
			return !spawn.sync(tslintBin(context), ['-v'], {stdio: 'ignore'}).error;
		} catch (e) {
			if (fs.existsSync(path.join(context, 'tslint.json'))) {
				console.warn(
					'TSLint config file found, however TSLint could not be resolved.\n' +
						'Install TSLint globally or locally on this project to ' +
						'enable TypeScript linting.'
				);
			}
		}
	}
	return false;
}

function tslint({fix = false} = {}, context) {
	const args = ['-p', context];
	if (fix) args.push('--fix');

	return new Promise((resolve, reject) => {
		const opts = {env: process.env, cwd: process.cwd(), stdio: 'inherit'};
		const child = spawn(tslintBin(context), args, opts);
		child.on('close', code => {
			if (code !== 0) {
				reject();
			} else {
				resolve();
			}
		});
	});
}

function api(opts) {
	const context = packageRoot().path;
	return Promise.resolve()
		.then(() => shouldESLint() && eslint(opts))
		.then(() => shouldTSLint(context) && tslint(opts, context));
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['local', 'strict', 'fix', 'help'],
		alias: {l: 'local', s: 'strict', framework: 'strict', f: 'fix', h: 'help'}
	});
	if (opts.help) displayHelp();

	api({strict: opts.strict, local: opts.local, fix: opts.fix, eslintArgs: opts._}).catch(() => {
		process.exit(1);
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
