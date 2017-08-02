// @remove-on-eject-begin
/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */
// @remove-on-eject-end

const
	chalk = require('chalk'),
	fs = require('fs-extra'),
	path = require('path'),
	minimist = require('minimist'),
	filesize = require('filesize'),
	webpack = require('webpack'),
	modifiers = require('./modifiers'),
	devConfig = require('../config/webpack.config.dev'),
	prodConfig = require('../config/webpack.config.prod'),
	findProjectRoot = require('./modifiers/util/find-project-root'),
	formatWebpackMessages = require('react-dev-utils/formatWebpackMessages'),
	checkRequiredFiles = require('react-dev-utils/checkRequiredFiles'),
	stripAnsi = require('strip-ansi');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact pack [options]');
	console.log();
	console.log('  Options');
	console.log('    -w, --watch       Rebuild on file changes');
	console.log('    -p, --production  Build in production mode');
	console.log('    -i, --isomorphic  Use isomorphic code layout');
	console.log('                      (includes prerendering)');
	console.log('    --stats           Output bundle analysis file');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	/*
		Private Options:
			-v8, --snapshot       Extension of isomorphic code layout which builds for V8 snapshot support
			--no-minify           Will skip minification during production build
			--framework           Builds the @enact/*, react, and react-dom into an external framework
			--externals           Specify a local directory path to the standalone external framework
			--externals-inject    Remote public path to the external framework for use injecting into HTML
			-l, --locales         Extension of isomorphic code layout to prerender locales. Can be:
			                          "used" - Prerender locales used within ./resources/
			                          "tv" - Prerender locales supported on the TV platform
			                          "signage" - Prerender locales supported on the signage platform
			                          "all" - Prerender all locales that iLib supports
			                          <JSON-filepath> - Prerender the locales listed within the JSON file
			                          <commana-separated-values> - Prerender the specifically listed locales
	*/
	process.exit(0);
}

function details(err, stats) {
	if(err) return err;
	const statsJSON = stats.toJson({}, true);
	const messages = formatWebpackMessages(statsJSON);
	if(messages.errors.length) {
		return new Error(messages.errors.join('\n\n'));
	} else if(process.env.CI && messages.warnings.length) {
		console.log(chalk.yellow('Treating warnings as errors because process.env.CI = true. '
				+ 'Most CI servers set it automatically.\n'));
		return new Error(messages.warnings.join('\n\n'));
	} else {
		printFileSizes(statsJSON);
		console.log();
		if(messages.warnings.length) {
			console.log(chalk.yellow('Compiled with warnings:\n'));
			console.log(messages.warnings.join('\n\n') + '\n');
		} else {
			console.log(chalk.green('Compiled successfully.'));
		}
		if (process.env.NODE_ENV === 'development') {
			console.log(chalk.yellow('NOTICE: This build contains debugging functionality and may run'
					+ ' slower than in production mode.'));
		}
		console.log();
	}
}

// Print a detailed summary of build files.
function printFileSizes(stats) {
	const assets = stats.assets.filter(asset => /\.(js|css|bin)$/.test(asset.name))
		.map(asset => {
			const size = fs.statSync('./dist/' + asset.name).size;
			return {
				folder: path.join('dist', path.dirname(asset.name)),
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
		console.log('	' + sizeLabel +	'	' + chalk.dim(asset.folder + path.sep)
				+ chalk.cyan(asset.name));
	});
}


// Create the production build and print the deployment instructions.
function build(config) {
	if (process.env.NODE_ENV === 'development') {
		console.log('Creating a development build...');
	} else {
		console.log('Creating an optimized production build...');
	}

	const compiler = webpack(config);
	compiler.run((err, stats) => {
		err = details(err, stats);
		if(err) {
			console.log();
			console.log(chalk.red('Failed to compile.\n'));
			console.log((err.message || err) + '\n');
			process.exit(1);
		}
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

module.exports = function(args) {
	const opts = minimist(args, {
		boolean: ['minify', 'framework', 'stats', 'p', 'production', 'i', 'isomorphic', 's', 'snapshot', 'w', 'watch', 'h', 'help'],
		string: ['externals', 'externals-inject', 'l', 'locales'],
		default: {minify:true},
		alias: {p:'production', i:'isomorphic', l:'locales', s:'snapshot', w:'watch', h:'help'}
	});
	if (opts.help) displayHelp();

	process.chdir(findProjectRoot().path);
	process.env.NODE_ENV = 'development';
	let config = devConfig;

	// Do this as the first thing so that any code reading it knows the right env.
	if (opts.production) {
		process.env.NODE_ENV = 'production';
		config = prodConfig;
	}

	modifiers.apply(config, opts);

	// Warn and crash if required files are missing
	if (!opts.framework && !checkRequiredFiles([config.entry.main[config.entry.main.length - 1]])) {
		process.exit(1);
	}

	// Remove all content but keep the directory so that
	// if you're in it, you don't end up in Trash
	fs.emptyDirSync('./dist');

	// Start the webpack build
	if (opts.watch) {
		config.bail = false;
		watch(config);
	} else {
		build(config);
	}
};
