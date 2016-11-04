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
	glob = require('glob'),
	filesize = require('filesize'),
	exists = require('path-exists').sync,
	rimrafSync = require('rimraf').sync,
	webpack = require('webpack'),
	devConfig = require('../config/webpack.config.dev'),
	prodConfig = require('../config/webpack.config.prod'),
	EnactFrameworkPlugin = require('../config/EnactFrameworkPlugin'),
	EnactFrameworkRefPlugin = require('../config/EnactFrameworkRefPlugin'),
	PrerenderPlugin = require('../config/PrerenderPlugin'),
	BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin,
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
		.filter(asset => /\.(js|css)$/.test(asset.name))
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

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return undefined;
	}
}

function externalFramework(config, external, inject) {
	// Add the reference plugin so the app uses the external framework
	config.plugins.push(new EnactFrameworkRefPlugin({
		name:'enact_framework',
		libraries:['@enact', 'react', 'react-dom'],
		external: {
			path: external,
			inject: inject
		}
	}));
}

function setupFramework(config) {
	// Form list of framework entries; Every @enact/* js file as well as react/react-dom
	var entry = glob.sync('@enact/**/*.@(js|jsx|es6)', {
		cwd: path.resolve('./node_modules'),
		nodir: true,
		ignore: [
			'./webpack.config.js',
			'./.eslintrc.js',
			'./karma.conf.js',
			'./build/**/*.*',
			'./dist/**/*.*',
			'./node_modules/**/*.*',
			'**/tests/*.js'
		]
	}).concat(['react', 'react-dom', 'react/lib/ReactPerf']);
	config.entry = {enact:entry};

	// Use universal module definition to allow usage and name as 'enact_framework'
	config.output.library = 'enact_framework';
	config.output.libraryTarget = 'umd';

	// Append additional options to the ilib-loader to skip './resources' detection/generation
	config.module.loaders[2].loader += '?noSave&noResources';

	// Remove the HTML generation plugin and webOS-meta plugin
	config.plugins.shift();
	config.plugins.pop();

	// Add the framework plugin to build in an externally accessible manner
	config.plugins.push(new EnactFrameworkPlugin());
}

function setupIsomorphic(config) {
	var meta = readJSON('package.json') || {};
	var enact = meta.enact || {};
	// Only use isomorphic if an isomorphic entrypoint is specified
	if(enact.isomorphic || enact.prerender) {
		var reactDOM = path.join(process.cwd(), 'node_modules', 'react-dom');
		if(!exists(reactDOM)) {
			reactDOM = require.resolve('react-dom');
		}
		// Include react-dom as top level entrypoint so espose-loader will expose
		// it to window.ReactDOM to allow runtime rendering of the app.
		config.entry.main.unshift(reactDOM);

		// The App entrypoint for isomorphics builds *must* export a ReactElement.
		config.entry.main[config.entry.main.length-1] = path.resolve(enact.isomorphic || enact.prerender);

		// Since we're building for isomorphic usage, expose ReactElement
		config.output.library = 'App';

		// Use universal module definition to allow usage in Node and browser environments.
		config.output.libraryTarget = 'umd';

		// Expose the 'react-dom' on a global context for App's rendering
		// Currently maps the toolset to window.ReactDOM.
		config.module.loaders.push({
			test: reactDOM,
			loader: 'expose?ReactDOM'
		});

		// Update HTML webpack plugin to use the isomorphic template and include screentypes
		config.plugins[0].options.inject = false;
		config.plugins[0].options.template = path.join(__dirname, '..', 'config',
				'html-template-isomorphic.ejs');
		config.plugins[0].options.screenTypes = enact.screenTypes
				|| readJSON('./node_modules/@enact/moonstone/MoonstoneDecorator/screenTypes.json')
				|| readJSON('./node_modules/enact/packages/moonstone/MoonstoneDecorator/screenTypes.json');

		// Include plugin to prerender the html into the index.html
		config.plugins.push(new PrerenderPlugin());
	} else {
		console.log(chalk.yellow('Isomorphic entrypoint not found in package.json; building normally'));
	}
}

function statsAnalyzer(config) {
	config.plugins.push(new BundleAnalyzerPlugin({
		analyzerMode: 'static',
		reportFilename: 'stats.html',
		openAnalyzer: false
	}));
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
	webpack(config).watch((err, stats) => {
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
			--framework           Builds the @enact/*, react, and react-dom into an external framework
			--no-minify           Will skip minification during production build
			--externals           Specify a local directory path to the standalone external framework
			--externals-inject    Remote public path to the external framework for use injecting into HTML
	*/
	process.exit(0);
}

module.exports = function(args) {
	var opts = minimist(args, {
		boolean: ['minify', 'framework', 's', 'stats', 'p', 'production', 'i', 'isomorphic', 'w', 'watch', 'h', 'help'],
		string: ['externals', 'externals-inject'],
		default: {minify:true},
		alias: {s:'stats', p:'production', i:'isomorphic', w:'watch', h:'help'}
	});
	opts.help && displayHelp();

	var config;

	// Do this as the first thing so that any code reading it knows the right env.
	if(opts.production) {
		process.env.NODE_ENV = 'production';
		config = prodConfig;
		if(!opts['minify']) {
			// Allow Uglify's optimizations/debug-code-removal but don't minify
			config.plugins[4].options.mangle = false;
			config.plugins[4].options.beautify = true;
			config.plugins[4].options.output.comments = true;
		}
	} else {
		process.env.NODE_ENV = 'development';
		config = devConfig;
	}

	if(opts.framework) {
		setupFramework(config);
	} else {
		if(opts.isomorphic) {
			setupIsomorphic(config);
		}
		if(opts.externals) {
			externalFramework(config, opts.externals, opts['externals-inject']);
		}
	}

	if(opts.stats) {
		statsAnalyzer(config);
	}

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
				.filter(fileName => /\.(js|css)$/.test(fileName))
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
