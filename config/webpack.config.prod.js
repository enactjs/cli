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

var path = require('path');
var fs = require('fs');
var webpack = require('webpack');
var autoprefixer = require('autoprefixer');
var removeclass = require('postcss-remove-classes').default;
var LessPluginRi = require('resolution-independence');
var HtmlWebpackPlugin = require('html-webpack-plugin');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var GracefulFsPlugin = require('graceful-fs-webpack-plugin');
var ILibPlugin = require('ilib-webpack-plugin');
var WebOSMetaPlugin = require('webos-meta-webpack-plugin');

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return null;
	}
}

var pkg = readJSON('package.json') || {};
var enact = pkg.enact || {};

// This is the production configuration.
// It compiles slowly and is focused on producing a fast and minimal bundle.
// The development configuration is different and lives in a separate file.
module.exports = {
	// Don't attempt to continue if there are any errors.
	bail: true,
	// Skip source map support
	devtool: null,
	// In production, we only want to load the polyfills and the app code.
	entry: {
		main: [
			require.resolve('./polyfills'),
			path.resolve(pkg.main || 'index.js')
		]
	},
	output: {
		// The build output directory.
		path: path.resolve('./dist'),
		// Generated JS file names (with nested folders).
		// There will be one main bundle, and one file per asynchronous chunk.
		// We don't currently advertise code splitting but Webpack supports it.
		filename: '[name].js'
	},
	resolve: {
		// These are the reasonable defaults supported by the React/ES6 ecosystem.
		extensions: ['', '.js', '.jsx', '.es6'],
		root: path.resolve('./node_modules'),
		alias: {
			// @remove-on-eject-begin
			'promise/lib/rejection-tracking': require.resolve('promise/lib/rejection-tracking'),
			'promise/lib/es6-extensions': require.resolve('promise/lib/es6-extensions'),
			'whatwg-fetch': require.resolve('whatwg-fetch'),
			'object-assign': require.resolve('object-assign'),
			// @remove-on-eject-end
			// Support ilib shorthand alias for ilib modules
			'ilib':'@enact/i18n/ilib/lib'
		}
	},
	// @remove-on-eject-begin
	// Resolve loaders (webpack plugins for CSS, images, transpilation) from the
	// directory of `enact-dev` itself rather than the project directory.
	resolveLoader: {
		root: path.resolve(__dirname, '../node_modules'),
		fallback: path.resolve('./node_modules')
	},
	// @remove-on-eject-end
	// Optional configuration for polyfilling NodeJS built-ins.
	node: enact.node || null,
	module: {
		// First, run the linter.
		// It's important to do this before Babel processes the JS.
		preLoaders: [
			{
				test: /\.(js|jsx|es6)$/,
				loader: 'eslint-loader',
				include: process.cwd(),
				exclude: /node_modules/
			}
		],
		loaders: [
			// Process JS with Babel.
			{
				test: /\.(js|jsx|es6)$/,
				loader: 'babel',
				exclude: /node_modules.(?!@enact)/,
				// @remove-on-eject-begin
				query: {
					babelrc: false,
					extends: path.join(__dirname, '.babelrc')
				}
				// @remove-on-eject-end
			},
			// Multiple styling-support features are used together.
			// "less" loader compiles any LESS-formatted syntax into standard CSS.
			// "postcss" loader applies autoprefixer to our CSS.
			// "css" loader resolves paths in CSS and adds assets as dependencies.
			// "style" loader normally turns CSS into JS modules injecting <style>,
			// but unlike in development configuration, we do something different.
			// `ExtractTextPlugin` first applies the "postcss" and "css" loaders
			// (second argument), then grabs the result CSS and puts it into a
			// separate file in our build process. This way we actually ship
			// a single CSS file in production instead of JS code injecting <style>
			// tags. If you use code splitting, however, any async bundles will still
			// use the "style" loader inside the async code so CSS from them won't be
			// in the main CSS file.
			{
				test: /\.(c|le)ss$/,
				// "?-autoprefixer" disables autoprefixer in css-loader itself:
				// https://github.com/webpack/css-loader/issues/281
				// We already have it thanks to postcss. We only pass this flag in
				// production because "css" loader only enables autoprefixer-powered
				// removal of unnecessary prefixes when Uglify plugin is enabled.
				// Webpack 1.x uses Uglify plugin as a signal to minify *all* the assets
				// including CSS. This is confusing and will be removed in Webpack 2:
				// https://github.com/webpack/webpack/issues/283
				loader: ExtractTextPlugin.extract('style',
						'css?-autoprefixer&modules&importLoaders=1!postcss!less')
				// Note: this won't work without `new ExtractTextPlugin()` in `plugins`.
			},
			// JSON is not enabled by default in Webpack but both Node and Browserify
			// allow it implicitly so we also enable it.
			{
				test: /\.json$/,
				loader: 'json'
			},
			// "file" loader makes sure those assets get copied during build
			// When you `import` an asset, you get its output filename.
			{
				test: /\.(ico|jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2)(\?.*)?$/,
				loader: 'file',
				query: {
					name: '[path][name].[ext]'
				}
			},
			// "url" loader works just like "file" loader but it also embeds
			// assets smaller than specified size as data URLs to avoid requests.
			{
				test: /\.(mp4|webm|wav|mp3|m4a|aac|oga)(\?.*)?$/,
				loader: 'url',
				query: {
					limit: 10000,
					name: '[path][name].[ext]'
				}
			}
		]
	},
	// @remove-on-eject-begin
	// Point ESLint to our predefined config.
	eslint: {
		configFile: require.resolve('eslint-config-enact'),
		useEslintrc: false,
		failOnError: true
	},
	// @remove-on-eject-end
	postcss: function() {
		return [
			// Automatically add vendor CSS prefixes
			autoprefixer({
				browsers: [
					'>1%',
					'last 4 versions',
					'Firefox ESR',
					'not ie < 9' // React doesn't support IE8 anyway
				]
			}),
			// Remove the development-only CSS class .__DEV__
			removeclass(['__DEV__'])
		];
	},
	// Options for the LESS loader
	lessLoader: {
		// If resolution independence options are specified, use the LESS plugin
		lessPlugins: ((enact.ri) ? [new LessPluginRi(enact.ri)] : [])
	},
	plugins: [
		// Generates an `index.html` file with the js and css tags injected.
		new HtmlWebpackPlugin({
			// Title can be specified in the package.json enact options or will
			// be determined automatically from any appinfo.json files discovered.
			title: enact.title || '',
			inject: 'body',
			template: enact.template || path.join(__dirname, 'html-template.ejs'),
			xhtml: true,
			minify: {
				removeComments: true,
				collapseWhitespace:false,
				removeRedundantAttributes: true,
				useShortDoctype: true,
				removeEmptyAttributes: true,
				removeStyleLinkTypeAttributes: true,
				keepClosingSlash: true,
				minifyJS: true,
				minifyCSS: true,
				minifyURLs: true
			}
		}),
		// Makes some environment variables available to the JS code, for example:
		// if (process.env.NODE_ENV === 'production') { ... }.
		// It is absolutely essential that NODE_ENV was set to production here.
		// Otherwise React will be compiled in the very slow development mode.
		new webpack.DefinePlugin({
			'process.env': {
				'NODE_ENV': '"production"'
			}
		}),
		// This helps ensure the builds are consistent if source hasn't changed:
		new webpack.optimize.OccurrenceOrderPlugin(),
		// Try to dedupe duplicated modules, if any:
		new webpack.optimize.DedupePlugin(),
		// Minify the code.
		new webpack.optimize.UglifyJsPlugin({
			compress: {
				screw_ie8: true, // React doesn't support IE8
				warnings: false
			},
			mangle: {
				screw_ie8: true
			},
			output: {
				comments: false,
				screw_ie8: true
			}
		}),
		// Note: this won't work without ExtractTextPlugin.extract(..) in `loaders`.
		new ExtractTextPlugin('[name].css'),
		// Switch the internal NodeOutputFilesystem to use graceful-fs to avoid
		// EMFILE errors when hanndling mass amounts of files at once, such as
		// what happens when using ilib bundles/resources.
		new GracefulFsPlugin(),
		// Automatically configure iLib library within @enact/i18n. Additionally,
		// ensure the locale data files and the resource files are copied during
		// the build to the output directory.
		new ILibPlugin(),
		// Automatically detect ./appinfo.json and ./webos-meta/appinfo.json files,
		// and parses any to copy over any webOS meta assets at build time.
		new WebOSMetaPlugin()
	]
};
