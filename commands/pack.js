/* eslint-env node, es6 */
// @remove-on-eject-begin
/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 * https://github.com/facebook/create-react-app
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end

/*********************************************************
 *  Dependencies
 ********************************************************/

/**
 * https://nodejs.org/api/path.html#path_path
 *
 * The path module provides utilities for working with file and directory paths. It can be accessed using:
 *
 * relative:
 * 		path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb'); // Returns: '../../impl/bbb'
 *
 * join:
 * 		path.join('/foo', 'bar', 'baz/asdf', 'quux', '..'); // Returns: '/foo/bar/baz/asdf'
 *
 * dirname:
 * 		path.dirname('/foo/bar/baz/asdf/quux'); // Returns: '/foo/bar/baz/asdf'
 *
 * basename:
 * 		On POSIX:	path.basename('C:\\temp\\myfile.html'); // Returns: 'C:\\temp\\myfile.html'
 * 		On Windows:	path.basename('C:\\temp\\myfile.html');	// Returns: 'myfile.html'
 * 		Recommend to use path.win32.basename or path.posix.basename
 *
 * sep:
 * 		'foo/bar/baz'.split(path.sep); // Returns: ['foo', 'bar', 'baz']
 * 		on Windows	\
 * 		on POSIX /
 *
 * resolve:
 * 		path.resolve('/foo/bar', './baz'); // Returns: '/foo/bar/baz'
 * 		path.resolve('/foo/bar', '/tmp/file/'); // Returns: '/tmp/file'
 * 		path.resolve('wwwroot', 'static_files/png/', '../gif/image.gif');
 * 			// If the current working directory is /home/myself/node,
 * 			// this returns '/home/myself/node/wwwroot/static_files/gif/image.gif'
 */
const path = require('path');

/**
 * https://github.com/chalk/chalk
 *
 * Modifiers - bold : chalk.bold.red()
 * Colors - cyan : chalk.cyan()
 * Background colors - chalk.bgBlueBright()
 */
const chalk = require('chalk');

/**
 * https://github.com/avoidwork/filesize.js
 *
 * filesize.js provides a simple way to get a human readable file size string from a number (float or integer) or string.
 *
 * @example
 * 		filesize(500);                        // "500 B"
 * 		filesize(500, {bits: true});          // "4 Kb"
 * 		filesize(265318, {base: 10});         // "265.32 kB"
 * 		filesize(265318);                     // "259.1 KB"
 * 		filesize(265318, {round: 0});         // "259 KB"
 */
const filesize = require('filesize');

/**
 * https://github.com/jprichardson/node-fs-extra
 *
 * fs-extra adds file system methods that aren't included in the native fs module and adds promise support to the fs methods.
 * It also uses graceful-fs to prevent EMFILE errors. It should be a drop in replacement for fs.
 *
 * fs.copySync:
 * 		https://github.com/jprichardson/node-fs-extra/blob/master/docs/copy-sync.md
 * 		Copy a file or directory. The directory can have contents.
 *
 * 		fs.copySync('/tmp/myfile', '/tmp/mynewfile') // copy file
 * 		fs.copySync('/tmp/mydir', '/tmp/mynewdir') // copy directory, even if it has subdirectories or files
 *
 * fs.emptyDir:
 * 		https://github.com/jprichardson/node-fs-extra/blob/master/docs/emptyDir.md
 * 		Ensures that a directory is empty. Deletes directory contents if the directory is not empty.
 * 		If the directory does not exist, it is created. The directory itself is not deleted.
 *
 * 		fs.emptyDir('/tmp/some/dir', err => {
 * 			if (err) return console.error(err)
 * 			console.log('success!')
 * 		})
 *
 * https://nodejs.org/api/fs.html
 *
 * The fs module provides an API for interacting with the file system in a manner closely modeled around standard POSIX functions.
 *
 * fs.existsSync:
 * 		Returns true if the path exists, false otherwise.
 *
 * 		if (fs.existsSync('/etc/passwd')) { }
 *
 * fs.statSync:
 * 		https://nodejs.org/api/fs.html#fs_class_fs_stats
 * 		A fs.Stats object provides information about a file.
 */
const fs = require('fs-extra');

/**
 * https://github.com/substack/minimist
 *
 * This module is the guts of optimist's argument parser without all the fanciful decoration.
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
 * https://github.com/facebook/create-react-app/tree/master/packages/react-dev-utils#formatwebpackmessageserrors-arraystring-warnings-arraystring-errors-arraystring-warnings-arraystring
 *
 * Extracts and prettifies warning and error messages from webpack stats object.
 */
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');

/**
 * https://github.com/chalk/strip-ansi
 *
 * Strip ANSI escape codes from a string
 *
 * @example
 * stripAnsi('\u001B[4mUnicorn\u001B[0m'); //=> 'Unicorn'
 * stripAnsi('\u001B]8;;https://github.com\u0007Click\u001B]8;;\u0007'); //=> 'Click'
 */
const stripAnsi = require('strip-ansi');

const webpack = require('webpack');

/**
 * https://github.com/enactjs/dev-utils
 *
 * A collection of development utilities for Enact apps.
 *
 * Plugins
 * 		EnactFrameworkPlugin & EnactFrameworkRefPlugin
 * 		EnzymeAdapterPlugin
 * 		GracefulFsPlugin
 * 		ILibPlugin
 * 		PrerenderPlugin
 * 		SnapshotPlugin
 * 		VerboseLogPlugin
 * 		WebOSMetaPlugin
 */
const {optionParser: app, mixins} = require('@enact/dev-utils');

/**
 * https://nodejs.org/api/process.html
 *
 * The process object is a global that provides information about, and control over, the current Node.js process. As a global, it is always available to Node.js applications without using require(). It can also be explicitly accessed using require():
 *
 * process.argv: https://nodejs.org/api/process.html#process_process_argv
 * 		$ node process-args.js one two=three four
 * 		0: /usr/local/bin/nodejs
 * 		1: /Users/mjr/work/node/process-args.jsnodejs
 * 		2: onenodejs
 * 		3: two=threenodejs
 * 		4: four
 *
 * process.chdir: https://nodejs.org/api/process.html#process_process_chdir_directory
 * 		The process.chdir() method changes the current working directory of the Node.js process
 * 		or throws an exception if doing so fails (for instance, if the specified directory does not exist).
 *
 * process.cwd: https://nodejs.org/api/process.html#process_process_cwd
 * 		The process.cwd() method returns the current working directory of the Node.js process.
 *
 * process.env: https://nodejs.org/api/process.html#process_process_env
 * 		The process.env property returns an object containing the user environment.
 * 		{
 * 		  TERM: 'xterm-256color',
 * 		  SHELL: '/usr/local/bin/bash',
 * 		  USER: 'maciej',
 * 		  PATH: '~/.bin/:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
 * 		  PWD: '/Users/maciej',
 * 		  EDITOR: 'vim',
 * 		  SHLVL: '1',
 * 		  HOME: '/Users/maciej',
 * 		  LOGNAME: 'maciej',
 * 		  _: '/usr/local/bin/node'
 * 		}
 *
 * process.exit: https://nodejs.org/api/process.html#process_process_exit_code
 * 		The exit code.
 * 		Default: 0 - The 'success' code
 */

/*********************************************************
 *  displayHelp()
 ********************************************************/

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	/**
	 * https://stackoverflow.com/questions/45136831/node-js-require-main-module
	 *
	 * require.main === module : this module was run directly from the command line as in node xxx.js
	 * require.main !== module : this module was not run directly from the command line and probably loaded by something else
	 */
	if (require.main !== module) e = 'enact pack';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -o, --output      Specify an output directory');
	console.log('    -w, --watch       Rebuild on file changes');
	console.log('    -p, --production  Build in production mode');
	console.log('    -i, --isomorphic  Use isomorphic code layout');
	console.log('                      (includes prerendering)');
	console.log('    -l, --locales     Locales for isomorphic mode; one of:');
	console.log('            <commana-separated-values> Locale list');
	console.log('            <JSON-filepath> - Read locales from JSON file');
	console.log('            "none" - Disable locale-specific handling');
	console.log('            "used" - Detect locales used within ./resources/');
	console.log('            "tv" - Locales supported on webOS TV');
	console.log('            "signage" - Locales supported on webOS signage');
	console.log('            "all" - All locales that iLib supports');
	console.log('    -s, --snapshot    Generate V8 snapshot blob');
	console.log('                      (requires V8_MKSNAPSHOT set)');
	console.log('    -m, --meta        JSON to override package.json enact metadata');
	console.log('    --stats           Output bundle analysis file');
	console.log('    --verbose         Verbose log build details');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	/*
		Private Options:
			--no-minify           Will skip minification during production build
			--framework           Builds the @enact/*, react, and react-dom into an external framework
			--externals           Specify a local directory path to the standalone external framework
			--externals-public    Remote public path to the external framework for use injecting into HTML
	*/

	process.exit(0);
}

/*********************************************************
 *  webpack()
 ********************************************************/

/**
 * api -> build, watch -> details
 */
function details(err, stats, output) {
	if (err) return err;
	stats.compilation.warnings.forEach(w => {
		w.message = w.message.replace(/\n.* potentially fixable with the `--fix` option./gm, '');
	});

	/**
	 * https://webpack.js.org/api/node/#statstojsonoptions
	 * Returns compilation information as a JSON object.
	 * options can be either a string (a preset) or an object for more granular control
	 *
	 * https://webpack.js.org/configuration/stats/#statsall
	 * A fallback value for stats options when an option is not defined. It has precedence over local webpack defaults.
	 *
	 * https://webpack.js.org/configuration/stats/#statserrors
	 * Tells stats whether to display the errors.
	 *
	 * https://webpack.js.org/configuration/stats/#statswarnings
	 * Tells stats to add warnings.
	 */
	const statsJSON = stats.toJson({all: false, warnings: true, errors: true});

	const messages = formatWebpackMessages(statsJSON);
	if (messages.errors.length) {
		return new Error(messages.errors.join('\n\n'));
	} else if (process.env.CI && messages.warnings.length) {
		console.log(
			chalk.yellow(
				'Treating warnings as errors because process.env.CI = true. ' +
					'Most CI servers set it automatically.\n'
			)
		);
		return new Error(messages.warnings.join('\n\n'));
	} else {
		copyPublicFolder(output);
		printFileSizes(stats, output);
		console.log();
		if (messages.warnings.length) {
			console.log(chalk.yellow('Compiled with warnings:\n'));
			console.log(messages.warnings.join('\n\n') + '\n');
		} else {
			console.log(chalk.green('Compiled successfully.'));
		}
		if (process.env.NODE_ENV === 'development') {
			console.log(
				chalk.yellow(
					'NOTICE: This build contains debugging functionality and may run' +
						' slower than in production mode.'
				)
			);
		}
		console.log();
	}
}

/**
 * api -> build, watch -> details -> copyPublicFolder
 */
function copyPublicFolder(output) {
	const staticAssets = './public';
	if (fs.existsSync(staticAssets)) {
		/**
		 * https://github.com/jprichardson/node-fs-extra/blob/master/docs/copy-sync.md
		 *
		 * dereference <boolean>: dereference symlinks, default is false.
		 */
		fs.copySync(staticAssets, output, {
			dereference: true
		});
	}
}

/**
 * api -> build, watch -> details -> printFileSizes
 */
// Print a detailed summary of build files.
function printFileSizes(stats, output) {
	const assets = stats
		/**
		 * https://webpack.js.org/configuration/stats/#statsassets
		 *
		 * Tells stats whether to show the asset information. Set stats.assets to false to hide it.
		 */
		.toJson({all: false, assets: true})
		.assets.filter(asset => /\.(js|css|bin)$/.test(asset.name))
		.map(asset => {
			const size = fs.statSync(path.join(output, asset.name)).size;
			return {
				folder: path.relative(app.context, path.join(output, path.dirname(asset.name))),
				name: path.basename(asset.name),
				size: size,
				sizeLabel: filesize(size)
			};
		});
	assets.sort((a, b) => b.size - a.size);
	const longestSizeLabelLength = Math.max.apply(
		null,
		assets.map(a => stripAnsi(a.sizeLabel).length)
	);
	assets.forEach(asset => {
		let sizeLabel = asset.sizeLabel;
		const sizeLength = stripAnsi(sizeLabel).length;
		if (sizeLength < longestSizeLabelLength) {
			const rightPadding = ' '.repeat(longestSizeLabelLength - sizeLength);
			sizeLabel += rightPadding;
		}
		console.log('	' + sizeLabel + '	' + chalk.dim(asset.folder + path.sep) + chalk.cyan(asset.name));
	});
}

/**
 * api -> build
 */
// Create the production build and print the deployment instructions.
function build(config) {
	if (process.env.NODE_ENV === 'development') {
		console.log('Creating a development build...');
	} else {
		console.log('Creating an optimized production build...');
	}

	return new Promise((resolve, reject) => {
		const compiler = webpack(config);
		compiler.run((err, stats) => {
			err = details(err, stats, config.output.path);
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

/**
 * api -> watch
 */
// Create the build and watch for changes.
function watch(config) {
	// Make sure webpack doesn't immediate bail on errors when watching.

	/**
	 * <Webpack Config>
	 *
	 * `bail`: false
	 */
	config.bail = false;

	if (process.env.NODE_ENV === 'development') {
		console.log('Creating a development build and watching for changes...');
	} else {
		console.log('Creating an optimized production build and watching for changes...');
	}
	webpack(config).watch({}, (err, stats) => {
		err = details(err, stats, config.output.path);
		if (err) {
			console.log(chalk.red('Failed to compile.\n'));
			console.log((err.message || err) + '\n');
		}
		console.log();
	});
}

/*********************************************************
 * cli and api
 ********************************************************/

function api(opts = {}) {
	/**
	 * <enact meta>
	 */

	if (opts.meta) {
		let meta = opts.meta;
		if (typeof meta === 'string') {
			try {
				meta = JSON.parse(opts.meta);
			} catch (e) {
				throw new Error('Invalid metadata; must be a valid JSON string.\n' + e.message);
			}
		}
		app.applyEnactMeta(meta);
	}

	/**
	 * <Webpack config>
	 */

	// Do this as the first thing so that any code reading it knows the right env.
	const configFactory = require('../config/webpack.config');

	/**
	 * <Webpack Config>
	 *
	 * `mode`: "development"
	 */
	const config = configFactory(opts.production ? 'production' : 'development');

	/**
	 * <Webpack Config>
	 *
	 * output
	 */
	// Set any output path override
	if (opts.output) config.output.path = path.resolve(opts.output);

	/**
	 * <Webpack Config>
	 */
	mixins.apply(config, opts);

	// Remove all content but keep the directory so that
	// if you're in it, you don't end up in Trash
	return fs.emptyDir(config.output.path).then(() => {
		// Start the webpack build
		if (opts.watch) {
			// This will run infinitely until killed, even through errors
			watch(config);
		} else {
			return build(config);
		}
	});
}

function cli(args) {
	/**
	 * https://github.com/substack/minimist
	 *
	 * opts.boolean - a boolean, string or array of strings to always treat as booleans. if true will treat all double hyphenated arguments without equal signs as boolean (e.g. affects --foo, not -f or --foo=bar)
	 * opts.string - a string or array of strings argument names to always treat as strings
	 * opts.default - an object mapping string argument names to default values
	 * opts.alias - an object mapping string names to strings or arrays of string argument names to use as aliases
	 */
	const opts = minimist(args, {
		boolean: ['minify', 'framework', 'stats', 'production', 'isomorphic', 'snapshot', 'verbose', 'watch', 'help'],
		string: ['externals', 'externals-public', 'locales', 'output', 'meta'],
		default: {minify: true},
		alias: {
			o: 'output',
			p: 'production',
			i: 'isomorphic',
			l: 'locales',
			s: 'snapshot',
			m: 'meta',
			w: 'watch',
			h: 'help'
		}
	});
	if (opts.help) displayHelp();

	process.chdir(app.context);
	api(opts).catch(err => {
		console.log();
		console.log(chalk.red('Failed to compile.\n'));
		console.log((err.message || err) + '\n');
		process.exit(1);
	});
}

module.exports = {api, cli};
/**
 * https://stackoverflow.com/questions/45136831/node-js-require-main-module
 *
 * require.main === module : this module was run directly from the command line as in node xxx.js
 * require.main !== module : this module was not run directly from the command line and probably loaded by something else
 */
if (require.main === module) cli(process.argv.slice(2));
