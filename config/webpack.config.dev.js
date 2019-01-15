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

const fs = require('fs');
const path = require('path');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin-alt');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const eslintFormatter = require('react-dev-utils/eslintFormatter');
const typescriptFormatter = require('react-dev-utils/typescriptFormatter');
const WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');
const LessPluginRi = require('resolution-independence');
const resolve = require('resolve');
const {DefinePlugin, EnvironmentPlugin} = require('webpack');
const {optionParser: app, GracefulFsPlugin, ILibPlugin, WebOSMetaPlugin} = require('@enact/dev-utils');

process.chdir(app.context);
process.env.NODE_ENV = 'development';

// Load applicable .env files into environment variables.
require('./dotenv').load(app.context);

// Sets the browserslist default fallback set of browsers to the Enact default browser support list
app.setEnactTargetsAsDefault();

// This is the development configuration.
// It is focused on developer experience and fast rebuilds.
// The production configuration is different and lives in a separate file.
module.exports = {
	mode: 'development',
	// Don't attempt to continue if there are any errors.
	bail: true,
	// We use sourcemaps to allow devtools to view the original module code data
	devtool: 'cheap-module-source-map',
	// These are the "entry points" to our application.
	// This means they will be the "root" imports that are included in JS bundle.
	// The first two entry points enable "hot" CSS and auto-refreshes for JS.
	entry: {
		main: [
			// Include a few polyfills by default (Promise, Object.assign, and fetch)
			require.resolve('./polyfills'),
			// Finally, this is your app's code
			app.context
		]
	},
	output: {
		// The build output directory.
		path: path.resolve('./dist'),
		// Generated JS file names (with nested folders).
		// There will be one main bundle, and one file per asynchronous chunk.
		// We don't currently advertise code splitting but Webpack supports it.
		filename: '[name].js',
		// There are also additional JS chunk files if you use code splitting.
		chunkFilename: 'chunk.[name].js',
		// Add /* filename */ comments to generated require()s in the output.
		pathinfo: true
	},
	resolve: {
		// These are the reasonable defaults supported by the React/ES6 ecosystem.
		extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
		// Allows us to specify paths to check for module resolving.
		modules: [path.resolve('./node_modules'), 'node_modules'],
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
				// Point ESLint to our predefined config.
				options: {
					formatter: eslintFormatter,
					// @remove-on-eject-begin
					baseConfig: {
						extends: [require.resolve('eslint-config-enact')]
					},
					useEslintrc: false,
					// @remove-on-eject-end
					cache: true
				},
				loader: require.resolve('eslint-loader'),
				include: process.cwd(),
				exclude: [/node_modules/, path.resolve(__dirname, '../config')]
			},
			// "file" loader makes sure those assets get copied during build
			// When you `import` an asset, you get its output filename.
			{
				exclude: /\.(html|js|jsx|ts|tsx|css|less|ejs|json)$/,
				loader: require.resolve('file-loader'),
				options: {
					name: '[path][name].[ext]'
				}
			},
			// Process JS and TS with Babel.
			{
				test: /\.(js|jsx|ts|tsx)$/,
				exclude: /node_modules.(?!@enact)/,
				use: [
					{
						loader: require.resolve('babel-loader'),
						options: {
							// @remove-on-eject-begin
							extends: path.join(__dirname, '.babelrc.js'),
							babelrc: false,
							// @remove-on-eject-end
							// This is a feature of `babel-loader` for webpack (not Babel itself).
							// It enables caching results in ./node_modules/.cache/babel-loader/
							// directory for faster rebuilds.
							cacheDirectory: true,
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
				use: [
					MiniCssExtractPlugin.loader,
					{
						loader: require.resolve('css-loader'),
						options: {
							importLoaders: 2,
							modules: true,
							sourceMap: true,
							localIdentName: '[name]__[local]___[hash:base64:5]'
						}
					},
					{
						loader: require.resolve('postcss-loader'),
						options: {
							ident: 'postcss', // https://webpack.js.org/guides/migrating/#complex-options
							sourceMap: true,
							plugins: () => [
								// Fix and adjust for known flexbox issues
								// See https://github.com/philipwalton/flexbugs
								require('postcss-flexbugs-fixes'),
								// Support @global-import syntax to import css in a global context.
								require('postcss-global-import'),
								// Transpile stage-3 CSS standards based on browserslist targets.
								// See https://preset-env.cssdb.org/features for supported features.
								// Includes support for targetted auto-prefixing.
								require('postcss-preset-env')({
									autoprefixer: {
										flexbox: 'no-2009',
										remove: false
									},
									stage: 3,
									features: {'custom-properties': false}
								})
							]
						}
					},
					{
						loader: require.resolve('less-loader'),
						options: {
							modifyVars: Object.assign({__DEV__: true}, app.accent),
							sourceMap: true,
							// If resolution independence options are specified, use the LESS plugin.
							plugins: app.ri ? [new LessPluginRi(app.ri)] : []
						}
					}
				]
			}
			// ** STOP ** Are you adding a new loader?
			// Remember to add the new extension(s) to the "file" loader exclusion regex list.
		]
	},
	// Specific webpack-dev-server options
	devServer: {
		// Broadcast http server on the localhost, port 8080
		host: '0.0.0.0',
		port: 8080
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
			xhtml: true
		}),
		// Make NODE_ENV environment variable available to the JS code, for example:
		// if (process.env.NODE_ENV === 'development') { ... }.
		new DefinePlugin({'process.env.NODE_ENV': JSON.stringify('development')}),
		// Inject prefixed environment variables within code, when used
		new EnvironmentPlugin(Object.keys(process.env).filter(key => /^REACT_APP_/.test(key))),
		// Note: this won't work without MiniCssExtractPlugin.loader in `loaders`.
		new MiniCssExtractPlugin({
			filename: '[name].css',
			chunkFilename: 'chunk.[name].css'
		}),
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
		// Automatically configure iLib library within @enact/i18n. Additionally,
		// ensure the locale data files and the resource files are copied during
		// the build to the output directory.
		new ILibPlugin(),
		// Automatically detect ./appinfo.json and ./webos-meta/appinfo.json files,
		// and parses any to copy over any webOS meta assets at build time.
		new WebOSMetaPlugin(),
		// TypeScript type checking
		fs.existsSync('tsconfig.json') &&
			new ForkTsCheckerWebpackPlugin({
				typescript: resolve.sync('typescript', {
					basedir: 'node_modules'
				}),
				async: false,
				checkSyntacticErrors: true,
				tsconfig: 'tsconfig.json',
				compilerOptions: {
					module: 'esnext',
					moduleResolution: 'node',
					resolveJsonModule: true,
					isolatedModules: true,
					noEmit: true,
					jsx: 'preserve'
				},
				reportFiles: [
					'**',
					'!**/*.json',
					'!**/__tests__/**',
					'!**/?(*.)(spec|test).*',
					'!**/*-specs.*',
					'!**/src/setupProxy.*',
					'!**/src/setupTests.*'
				],
				watch: app.context,
				silent: true,
				formatter: typescriptFormatter
			})
	].filter(Boolean)
};
