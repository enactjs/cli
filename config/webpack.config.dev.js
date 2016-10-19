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
var findCacheDir = require('find-cache-dir');
var autoprefixer = require('autoprefixer');
var LessPluginRi = require('resolution-independence');
var HtmlWebpackPlugin = require('html-webpack-plugin');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var GracefulFsPlugin = require('graceful-fs-webpack-plugin');
var WebOSMetaPlugin = require('webos-meta-webpack-plugin');
var CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
var WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return undefined;
	}
}

var pkg = readJSON('package.json') || {};
var enact = pkg.enact || {};

// This is the development configuration.
// It is focused on developer experience and fast rebuilds.
// The production configuration is different and lives in a separate file.
module.exports = {
	// We use sourcemaps to allow devtools to view the original module code data
	devtool: 'sourcemap',
	// These are the "entry points" to our application.
	// This means they will be the "root" imports that are included in JS bundle.
	// The first two entry points enable "hot" CSS and auto-refreshes for JS.
	entry: {
		main: [
			// Include a few polyfills by default (Promise, Object.assign, and fetch)
			require.resolve('./polyfills'),
			// Include React performance tools for debugging/optimization testing
			require.resolve('react-addons-perf'),
			// Finally, this is your app's code
			path.resolve(pkg.main || 'index.js')
		]
	},
	output: {
		// The build output directory.
		path: path.resolve('./dist'),
		// Generated JS file names (with nested folders).
		// There will be one main bundle, and one file per asynchronous chunk.
		// We don't currently advertise code splitting but Webpack supports it.
		filename: '[name].js',
		// Add /* filename */ comments to generated require()s in the output.
		pathinfo: true
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
				exclude: /node_modules.(?!@*enact)/,
				query: {
					// @remove-on-eject-begin
					babelrc: false,
					extends: path.join(__dirname, '.babelrc'),
					// @remove-on-eject-end
					// This is a feature of `babel-loader` for webpack (not Babel itself).
					// It enables caching results in ./node_modules/.cache/react-scripts/
					// directory for faster rebuilds. So use findCacheDir() because of:
					// https://github.com/facebookincubator/create-react-app/issues/483
					cacheDirectory: findCacheDir({
						name: 'enact-dev'
					})
				}
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
						'css?-autoprefixer&modules&sourceMap&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]!postcss!less?sourceMap')
				// Note: this won't work without `new ExtractTextPlugin()` in `plugins`.
			},
			// Support importing ilib bundles.
			{
				test: /ilibmanifest\.json$/,
				loader: 'ilib'
			},
			// JSON is not enabled by default in Webpack but both Node and Browserify
			// allow it implicitly so we also enable it.
			{
				test: /\.json$/,
				loader: 'json',
				exclude: /ilibmanifest\.json$/
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
			},
			// Expose the 'react-addons-perf' on a global context for debugging.
			// Currently maps the toolset to window.ReactPerf.
			{
				test: require.resolve('react-addons-perf'),
				loader: 'expose?ReactPerf'
			}
		]
	},
	// Specific webpack-dev-server options
	devServer: {
		// Broadcast http server on the localhost, port 8080
		host: '0.0.0.0',
		port: 8080
	},
	// @remove-on-eject-begin
	// Point ESLint to our predefined config.
	eslint: {
		configFile: require.resolve('eslint-config-enact'),
		useEslintrc: false,
		failOnError: true
	},
	// @remove-on-eject-end
	// We use PostCSS for autoprefixing only.
	postcss: function() {
		return [
			autoprefixer({
				browsers: [
					'>1%',
					'last 4 versions',
					'Firefox ESR',
					'not ie < 9', // React doesn't support IE8 anyway
				]
			}),
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
			template: path.join(__dirname, 'html-template.ejs'),
			xhtml: true
		}),
		// Makes some environment variables available to the JS code, for example:
		// if (process.env.NODE_ENV === 'development') { ... }.
		new webpack.DefinePlugin({
			'process.env': {
				'NODE_ENV': '"development"'
			}
		}),
		// Note: this won't work without ExtractTextPlugin.extract(..) in `loaders`.
		new ExtractTextPlugin('[name].css'),
		// Watcher doesn't work well if you mistype casing in a path so this is
		// a plugin that prints an error when you attempt to do this.
		// See https://github.com/facebookincubator/create-react-app/issues/240
		new CaseSensitivePathsPlugin(),
		// If you require a missing module and then `npm install` it, you still have
		// to restart the development server for Webpack to discover it. This plugin
		// makes the discovery automatic so you don't have to restart.
		// See https://github.com/facebookincubator/create-react-app/issues/186
		new WatchMissingNodeModulesPlugin('./node_modules'),
		// Switch the internal NodeOutputFilesystem to use graceful-fs to avoid
		// EMFILE errors when hanndling mass amounts of files at once, such as
		// what happens when using ilib bundles/resources.
		new GracefulFsPlugin(),
		// Automatically detect ./appinfo.json and ./webos-meta/appinfo.json files,
		// and parses any to copy over any webOS meta assets at build time.
		new WebOSMetaPlugin()
	]
};

try {
	fs.accessSync(path.join('node_modules', 'enact'));
	module.exports.resolve.alias['@enact'] = 'enact/packages';
} catch (err) {
	delete module.exports.resolve.alias['@enact'];
}
