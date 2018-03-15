// @remove-on-eject-begin
/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 * https://github.com/facebookincubator/create-react-app
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// @remove-on-eject-end

const path = require('path');
const autoprefixer = require('autoprefixer');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const flexbugfixes = require('postcss-flexbugs-fixes');
const removeclass = require('postcss-remove-classes').default;
const eslintFormatter = require('react-dev-utils/eslintFormatter');
const LessPluginRi = require('resolution-independence');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const {DefinePlugin} = require('webpack');
const {optionParser: app, GracefulFsPlugin, ILibPlugin, WebOSMetaPlugin} = require('@enact/dev-utils');

process.chdir(app.context);

// This is the production configuration.
// It compiles slowly and is focused on producing a fast and minimal bundle.
// The development configuration is different and lives in a separate file.
module.exports = {
	// Don't attempt to continue if there are any errors.
	bail: true,
	// Skip source map support
	devtool: false,
	// In production, we only want to load the polyfills and the app code.
	entry: {
		main: [require.resolve('./polyfills'), app.context]
	},
	output: {
		// The build output directory.
		path: path.resolve('./dist'),
		// Generated JS file names (with nested folders).
		// There will be one main bundle, and one file per asynchronous chunk.
		// We don't currently advertise code splitting but Webpack supports it.
		filename: '[name].js',
		// There are also additional JS chunk files if you use code splitting.
		chunkFilename: 'chunk.[name].js'
	},
	resolve: {
		// These are the reasonable defaults supported by the React/ES6 ecosystem.
		extensions: ['.js', '.jsx', '.json'],
		// Allows us to specify paths to check for module resolving.
		modules: [path.resolve('./node_modules'), 'node_modules'],
		// Allow "browser" field in electron-renderer along with the default web/webworker types.
		mainFields: [
			['web', 'webworker', 'electron-renderer'].includes(app.environment) && 'browser',
			'module',
			'main'
		].filter(Boolean),
		alias: {
			// Support ilib shorthand alias for ilib modules
			ilib: '@enact/i18n/ilib/lib'
		}
	},
	// @remove-on-eject-begin
	// Resolve loaders (webpack plugins for CSS, images, transpilation) from the
	// directory of `@enact/cli` itself rather than the project directory.
	resolveLoader: {
		modules: [path.resolve(__dirname, '../node_modules'), path.resolve('./node_modules')]
	},
	// @remove-on-eject-end
	module: {
		rules: [
			// First, run the linter.
			// It's important to do this before Babel processes the JS.
			{
				test: /\.(js|jsx)$/,
				enforce: 'pre',
				// @remove-on-eject-begin
				// Point ESLint to our predefined config.
				options: {
					formatter: eslintFormatter,
					baseConfig: {
						extends: [require.resolve('eslint-config-enact')]
					},
					cache: true,
					useEslintrc: false
				},
				// @remove-on-eject-end
				loader: require.resolve('eslint-loader'),
				include: process.cwd(),
				exclude: /node_modules/
			},
			// "file" loader makes sure those assets get copied during build
			// When you `import` an asset, you get its output filename.
			{
				exclude: /\.(html|js|jsx|css|less|ejs|json)$/,
				loader: require.resolve('file-loader'),
				options: {
					name: '[path][name].[ext]'
				}
			},
			// Process JS with Babel.
			{
				test: /\.(js|jsx)$/,
				exclude: /node_modules.(?!@enact)/,
				use: [
					require.resolve('thread-loader'),
					{
						loader: require.resolve('babel-loader'),
						options: {
							// @remove-on-eject-begin
							babelrc: false,
							extends: path.join(__dirname, '.babelrc.js'),
							// @remove-on-eject-end
							highlightCode: true
						}
					}
				]
			},
			// Multiple styling-support features are used together.
			// "less" loader compiles any LESS-formatted syntax into standard CSS.
			// "postcss" loader applies autoprefixer to our CSS.
			// "css" loader resolves paths in CSS and adds assets as dependencies.
			// `ExtractTextPlugin` applies the "less", "postcss" and "css" loaders,
			// then grabs the result CSS and puts it into a separate file in our
			// build process. If you use code splitting, any async bundles will still
			// use the "style" loader inside the async code so CSS from them won't be
			// in the main CSS file.
			{
				test: /\.(c|le)ss$/,
				// Note: this won't work without `new ExtractTextPlugin()` in `plugins`.
				loader: ExtractTextPlugin.extract({
					fallback: require.resolve('style-loader'),
					use: [
						{
							loader: require.resolve('css-loader'),
							options: {
								importLoaders: 2,
								modules: true,
								minimize: true
							}
						},
						{
							loader: require.resolve('postcss-loader'),
							options: {
								ident: 'postcss', // https://webpack.js.org/guides/migrating/#complex-options
								plugins: () => [
									// Automatically add vendor CSS prefixes.
									autoprefixer({
										browsers: app.browsers,
										flexbox: 'no-2009',
										remove: false
									}),
									// Fix and adjust for known flexbox issues
									// See https://github.com/philipwalton/flexbugs
									flexbugfixes,
									// Remove the development-only CSS class `.__DEV__`.
									removeclass(['__DEV__'])
								]
							}
						},
						{
							loader: require.resolve('less-loader'),
							options: {
								// If resolution independence options are specified, use the LESS plugin.
								plugins: app.ri ? [new LessPluginRi(app.ri)] : []
							}
						}
					]
				})
			}
			// ** STOP ** Are you adding a new loader?
			// Remember to add the new extension(s) to the "file" loader exclusion regex list.
		]
	},
	// Target app to build for a specific environment (default 'web')
	target: app.environment,
	// Optional configuration for polyfilling NodeJS built-ins.
	node: app.nodeBuiltins,
	performance: {
		hints: false
	},
	plugins: [
		// Generates an `index.html` file with the js and css tags injected.
		new HtmlWebpackPlugin({
			// Title can be specified in the package.json enact options or will
			// be determined automatically from any appinfo.json files discovered.
			title: app.title || '',
			inject: 'body',
			template: app.template || path.join(__dirname, 'html-template.ejs'),
			xhtml: true,
			minify: {
				removeComments: true,
				collapseWhitespace: false,
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
		// Make NODE_ENV environment variable available to the JS code, for example:
		// if (process.env.NODE_ENV === 'production') { ... }.
		// It is absolutely essential that NODE_ENV was set to production here.
		// Otherwise React will be compiled in the very slow development mode.
		new DefinePlugin({
			'process.env': {
				NODE_ENV: '"production"'
			}
		}),
		// Minify the code.
		new UglifyJsPlugin({
			uglifyOptions: {
				compress: {
					warnings: false,
					// Disabled because of an issue with Uglify breaking seemingly valid code:
					// https://github.com/facebookincubator/create-react-app/issues/2376
					// Pending further investigation:
					// https://github.com/mishoo/UglifyJS2/issues/2011
					comparisons: false
				},
				output: {
					comments: false,
					// Turned on because emoji and regex is not minified properly using default
					// https://github.com/facebookincubator/create-react-app/issues/2488
					ascii_only: true
				}
			}
		}),
		// Note: this won't work without ExtractTextPlugin.extract(..) in `loaders`.
		new ExtractTextPlugin('[name].css'),
		// Ensure correct casing in module filepathes
		new CaseSensitivePathsPlugin(),
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
