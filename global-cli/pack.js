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

var
	chalk = require('chalk'),
	fs = require('fs-extra'),
	path = require('path'),
	minimist = require('minimist'),
	filesize = require('filesize'),
	rimrafSync = require('rimraf').sync,
	webpack = require('webpack'),
	modifiers = require('./modifiers'),
	devConfig = require('../config/webpack.config.dev'),
	prodConfig = require('../config/webpack.config.prod'),
	checkRequiredFiles = require('react-dev-utils/checkRequiredFiles'),
	recursive = require('recursive-readdir'),
	stripAnsi = require('strip-ansi');

// Input: /User/dan/app/build/static/js/main.js
// Output: /static/js/main.js
function shortFilename(fileName) {
	return fileName
		.replace(path.resolve(path.join(process.cwd(), 'dist')), '');
}

// Input: 1024, 2048
// Output: "(+1 KB)"
function getDifferenceLabel(currentSize, previousSize) {
	var FIFTY_KILOBYTES = 1024 * 50;
	var difference = currentSize - previousSize;
	var fileSize = !Number.isNaN(difference) ? filesize(difference) : 0;
	if (difference >= FIFTY_KILOBYTES) {
		return chalk.red('+' + fileSize);
	} else if (difference < FIFTY_KILOBYTES && difference > 0) {
		return chalk.yellow('+' + fileSize);
	} else if (difference < 0) {
		return chalk.green(fileSize);
	} else {
		return '';
	}
}

// Print a detailed summary of build files.
function printFileSizes(stats, previousSizeMap) {
	var assets = stats.toJson().assets
		.filter(asset => /\.(js|css|bin)$/.test(asset.name))
		.map(asset => {
			var fileContents = fs.readFileSync('./dist/' + asset.name);
			var size = fs.statSync('./dist/' + asset.name).size;
			var previousSize = previousSizeMap[shortFilename(asset.name)];
			var difference = getDifferenceLabel(size, previousSize);
			return {
				folder: path.join('dist', path.dirname(asset.name)),
				name: path.basename(asset.name),
				size: size,
				sizeLabel: filesize(size) + (difference ? ' (' + difference + ')' : '')
			};
		});
	assets.sort((a, b) => b.size - a.size);
	var longestSizeLabelLength = Math.max.apply(null,
		assets.map(a => stripAnsi(a.sizeLabel).length)
	);
	assets.forEach(asset => {
		var sizeLabel = asset.sizeLabel;
		var sizeLength = stripAnsi(sizeLabel).length;
		if (sizeLength < longestSizeLabelLength) {
			var rightPadding = ' '.repeat(longestSizeLabelLength - sizeLength);
			sizeLabel += rightPadding;
		}
		console.log(
			'	' + sizeLabel +
			'	' + chalk.dim(asset.folder + path.sep) + chalk.cyan(asset.name)
		);
	});
}

// Create the build and optionally, print the deployment instructions.
function build(config, previousSizeMap, guided) {
	if(process.env.NODE_ENV === 'development') {
		console.log('Creating a development build...');
	} else {
		console.log('Creating an optimized production build...');
	}
	config.bail = true;
	webpack(config).run((err, stats) => {
		if (err) {
			console.log();
			console.error(chalk.red('Failed to create a ' + process.env.NODE_ENV + ' build.'));
			console.error(err.message || err);
			process.exit(1);
		}

		printFileSizes(stats, previousSizeMap);
		console.log();
		console.log(chalk.green('Compiled successfully.'));
		console.log();

		if(guided) {
			var openCommand = process.platform === 'win32' ? 'start' : 'open';
			console.log('The ' + chalk.cyan('dist') + ' directory is ready to be deployed.');
			console.log('You may also serve it locally with a static server:');
			console.log();
			console.log('	' + chalk.cyan('npm') +	' install -g pushstate-server');
			console.log('	' + chalk.cyan('pushstate-server') + ' dist');
			console.log('	' + chalk.cyan(openCommand) + ' http://localhost:9000');
			console.log();
		}
	});
}

// Create the build and watch for changes.
function watch(config) {
	if(process.env.NODE_ENV === 'development') {
		console.log('Creating a development build and watching for changes...');
	} else {
		console.log('Creating an optimized production build and watching for changes...');
	}
	webpack(config).watch({}, (err, stats) => {
		if (err) {
			console.error('Failed to create ' + process.env.NODE_ENV + ' build. Reason:');
			console.error(err.message || err);
		}
		console.log(chalk.green('Compiled successfully.'));
		console.log();
	});
}

function displayHelp() {
	console.log('  Usage');
	console.log('    enact pack [options]');
	console.log();
	console.log('  Options');
	console.log('    -s, --stats       Output bundle analysis file');
	console.log('    -w, --watch       Rebuild on file changes');
	console.log('    -p, --production  Build in production mode');
	console.log('    -i, --isomorphic  Use isomorphic code layout');
	console.log('                      (Includes prerendering)');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	/*
		Hidden Options:
			--snapshot            Extension of isomorphic code layout which builds for V8 snapshot support
			--no-minify           Will skip minification during production build
			--framework           Builds the @enact/*, react, and react-dom into an external framework
			--externals           Specify a local directory path to the standalone external framework
			--externals-inject    Remote public path to the external framework for use injecting into HTML
			--locales             Specifies to prerender locales. Can be:
			                          "used" - Prerender locales used within ./resources/
			                          "tv" - Prerender locales supported on the TV platform
			                          "signage" - Prerender locales supported on the signage platform
			                          "ilib" - Prerender all locales that iLib supports
			                          <commana-separated-values> - Prerender the specifically listed locales
	*/
	process.exit(0);
}

module.exports = function(args) {
	var opts = minimist(args, {
		boolean: ['minify', 'framework', 's', 'stats', 'p', 'production', 'i', 'isomorphic', 'snapshot', 'w', 'watch', 'h', 'help'],
		string: ['externals', 'externals-inject', 'locales'],
		default: {minify:true},
		alias: {s:'stats', p:'production', i:'isomorphic', w:'watch', h:'help'}
	});
	opts.help && displayHelp();

	process.env.NODE_ENV = 'development';
	var config = devConfig;

	// Do this as the first thing so that any code reading it knows the right env.
	if(opts.production) {
		process.env.NODE_ENV = 'production';
		config = prodConfig;
	}

	modifiers.apply(config, opts);

	// Warn and crash if required files are missing
	if (!opts.framework && !checkRequiredFiles([config.entry.main[config.entry.main.length-1]])) {
		process.exit(1);
	}

	if(opts.watch) {
		watch(config);
	} else {
		// Read the current file sizes in dist directory.
		// This lets us display how much they changed later.
		recursive('dist', (err, fileNames) => {
			var previousSizeMap = (fileNames || [])
				.filter(fileName => /\.(js|css|bin)$/.test(fileName))
				.reduce((memo, fileName) => {
					var key = shortFilename(fileName);
					memo[key] = fs.statSync(fileName).size;
					return memo;
				}, {});

			// Remove all content but keep the directory so that
			// if you're in it, you don't end up in Trash
			try {
				rimrafSync('dist/*');
			} catch(e) {
				console.log(chalk.red('Error: ') + ' Unable to delete existing build files. '
						+ 'Please close any programs currently accessing files within ./dist/.');
				console.log();
				process.exit(1);
			}

			// Start the webpack build
			build(config, previousSizeMap);
		});
	}
};
