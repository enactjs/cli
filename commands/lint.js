/* eslint-env node, es6 */

/*********************************************************
 *  Dependencies
 ********************************************************/

/**
 * https://nodejs.org/api/child_process.html#child_process_child_process_execsync_command_options
 *
 * child_process.execSync(command[, options])
 *
 * The child_process.execSync() method is generally identical to child_process.exec() with the exception that the method will not return until the child process has fully closed.
 */
const cp = require('child_process');
/**
 * https://nodejs.org/api/fs.html#fs_fs_existssync_path
 *
 * fs.existsSync(path)
 * Returns true if the path exists, false otherwise.
 */
const fs = require('fs');
/**
 * https://nodejs.org/api/path.html
 *
 * relative:
 * 		path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb'); // Returns: '../../impl/bbb'
 *
 * join:
 * 		path.join('/foo', 'bar', 'baz/asdf', 'quux', '..'); // Returns: '/foo/bar/baz/asdf'
 */
const path = require('path');
/**
 * https://github.com/moxystudio/node-cross-spawn
 *
 * const child = spawn('npm', ['list', '-g', '-depth', '0'], { stdio: 'inherit' }); // Spawn NPM asynchronously
 * const result = spawn.sync('npm', ['list', '-g', '-depth', '0'], { stdio: 'inherit' }); // Spawn NPM synchronously
 *
 * https://nodejs.org/api/child_process.html#child_process_options_stdio
 *
 * spawn('prg', [], { stdio: 'inherit' }); // Child will use parent's stdios.
 */
const spawn = require('cross-spawn');
/**
 * https://github.com/isaacs/node-glob
 *
 * "Globs" are the patterns you type when you do stuff like ls *.js on the command line, or put build/* in a .gitignore file.
 */
const glob = require('glob');
/**
 * https://github.com/substack/minimist
 *
 * This module is the guts of optimist's argument parser without all the fanciful decoration.
 *
 * Options
 * nodir: Do not match directories, only files. (Note: to match only directories, simply put a / at the end of the pattern.)
 *
 * @example
 * var argv = require('minimist')(process.argv.slice(2));
 * console.log(argv);
 *
 * $ node example/parse.js -a beep -b boop
 * { _: [], a: 'beep', b: 'boop' }
 *
 * $ node example/parse.js -x 3 -y 4 -n5 -abc --beep=boop foo bar baz
 *  { _: [ 'foo', 'bar', 'baz' ],
 *    x: 3,
 *    y: 4,
 *    n: 5,
 *    a: true,
 *    b: true,
 *    c: true,
 *    beep: 'boop'
 *   }
 */
const minimist = require('minimist');
/**
 * https://github.com/browserify/resolve#resolvesyncid-opts
 *
 * resolve.sync(id, opts)
 * Synchronously resolve the module path string id, returning the result and throwing an error when id can't be resolved.
 */
const resolver = require('resolve');
const {packageRoot} = require('@enact/dev-utils');

/*********************************************************
 *  Initialize
 ********************************************************/

const globOpts = {
	ignore: ['**/node_modules/**', 'build/**', '**/dist/**', 'coverage/**', 'tests/**'],
	nodir: true
};

/*********************************************************
 *  displayHelp()
 ********************************************************/

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

/*********************************************************
 * cli and api
 ********************************************************/

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
