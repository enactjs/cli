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
const path = require('path');
const chalk = require('chalk');
const filesize = require('filesize');
const fs = require('fs-extra');
const minimist = require('minimist');
const formatWebpackMessages = require('react-dev-utils/formatWebpackMessages');
const stripAnsi = require('strip-ansi');
const webpack = require('webpack');
const {optionParser: app, mixins} = require('@enact/dev-utils');

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
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

function details(err, stats, output) {
	if (err) return err;
	stats.compilation.warnings.forEach(w => {
		w.message = w.message.replace(/\n.* potentially fixable with the `--fix` option./gm, '');
	});
	const statsJSON = stats.toJson({}, true);
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
		printFileSizes(statsJSON, output);
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

// Print a detailed summary of build files.
function printFileSizes(stats, output) {
	const assets = stats.assets.filter(asset => /\.(js|css|bin)$/.test(asset.name)).map(asset => {
		const size = fs.statSync(path.join(output, asset.name)).size;
		return {
			folder: path.relative(app.context, path.join(output, path.dirname(asset.name))),
			name: path.basename(asset.name),
			size: size,
			sizeLabel: filesize(size)
		};
	});
	assets.sort((a, b) => b.size - a.size);
	const longestSizeLabelLength = Math.max.apply(null, assets.map(a => stripAnsi(a.sizeLabel).length));
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

// Create the build and watch for changes.
function watch(config) {
	// Make sure webpack doesn't immediate bail on errors when watching.
	config.bail = false;
	if (process.env.NODE_ENV === 'development') {
		console.log('Creating a development build and watching for changes...');
	} else {
		console.log('Creating an optimized production build and watching for changes...');
	}
	webpack(config).watch({}, (err, stats) => {
		err = details(err, stats);
		if (err) {
			console.log(chalk.red('Failed to compile.\n'));
			console.log((err.message || err) + '\n');
		}
		console.log();
	});
}

function api(opts = {}) {
	let config;

	// Apply any package.json enact metadata overrides.
	// Until webpak 4 is used, must occur before requiring webpack config.
	if (opts.meta) {
		let meta;
		try {
			meta = JSON.parse(opts.meta);
		} catch (e) {
			throw new Error('Invalid metadata; must be a valid JSON string.\n' + e.message);
		}
		app.applyEnactMeta(meta);
	}

	// Do this as the first thing so that any code reading it knows the right env.
	if (opts.production) {
		process.env.NODE_ENV = 'production';
		config = require('../config/webpack.config.prod');
	} else {
		process.env.NODE_ENV = 'development';
		config = require('../config/webpack.config.dev');
	}

	// Set any output path override
	if (opts.output) config.output.path = path.resolve(opts.output);

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
if (require.main === module) cli(process.argv.slice(2));
