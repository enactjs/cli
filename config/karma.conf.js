/* eslint no-var: "off" */

var path = require('path');
var webpack = require('webpack');
var autoprefixer = require('autoprefixer');
var LessPluginRi = require('resolution-independence');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var GracefulFsPlugin = require('graceful-fs-webpack-plugin');
var ILibPlugin = require('ilib-webpack-plugin');
var CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');

var pkg = require(path.resolve('./package.json'));
var enact = pkg.enact || {};

module.exports = function(karma) {
	karma.set({
		basePath: process.cwd(),
		frameworks: ['mocha', 'chai', 'dirty-chai'],
		files: [
			require.resolve('./polyfills'),
			require.resolve('string.prototype.repeat'),
			require.resolve('phantomjs-polyfill-array-from'),
			require.resolve('es6-map/implement'),
			require.resolve('./proptype-checker'),
			'./!(node_modules|dist|build)/**/*-specs.js'
		],

		preprocessors: {
			// add webpack as preprocessor
			'./!(node_modules|dist|build)/**/*.js': ['webpack'],
			[require.resolve('./polyfills')]: ['webpack'],
			[require.resolve('string.prototype.repeat')]: ['webpack'],
			[require.resolve('phantomjs-polyfill-array-from')]: ['webpack'],
			[require.resolve('es6-map/implement')]: ['webpack'],
			[require.resolve('./proptype-checker')]: ['webpack']
		},

		failOnEmptyTestSuite: true,

		webpack: {
			// Use essentially the same webpack config as from the development build setup.
			// We do not include an entry value as Karma will control that.
			devtool: false,
			output: {
				path: './dist',
				filename: '[name].js'
			},
			resolve: {
				extensions: ['.js', '.jsx', '.json'],
				modules: ['node_modules', path.resolve('./node_modules')],
				alias: {
					'ilib':'@enact/i18n/ilib/lib',
					'react-addons-test-utils':'react-dom/test-utils'
				}
			},
			// @remove-on-eject-begin
			resolveLoader: {
				modules: [
					path.resolve(__dirname, '../node_modules'),
					path.resolve('./node_modules')
				]
			},
			// @remove-on-eject-end
			externals: {
				'cheerio': 'window',
				'react/addons': true,
				'react/lib/ExecutionEnvironment': true,
				'react/lib/ReactContext': true
			},
			node: Object.assign({}, enact.node || {}, {
				console: true,
				fs: 'empty',
				net: 'empty',
				tls: 'empty'
			}),
			module: {
				rules: [
					{
						exclude: /\.(html|js|jsx|css|less|ejs|json|bmp|gif|jpe?g|png|svg)$/,
						loader: 'file-loader',
						options: {name: '[path][name].[ext]'}
					},
					{
						test: /\.(bmp|gif|jpe?g|png|svg)$/,
						loader: 'url-loader',
						options: {limit: 10000, name: '[path][name].[ext]'}
					},
					{
						test: /\.(js|jsx)$/,
						exclude: /node_modules.(?!@enact)/,
						loader: 'babel-loader',
						options: {
							// @remove-on-eject-begin
							babelrc: false,
							extends: path.join(__dirname, '.babelrc'),
							// @remove-on-eject-end
							cacheDirectory: true
						}
					},
					{
						test: /\.(c|le)ss$/,
						// Note: this won't work without `new ExtractTextPlugin()` in `plugins`.
						loader: ExtractTextPlugin.extract({
							fallback: 'style-loader',
							use: [
								{
									loader: 'css-loader',
									options: {importLoaders: 2, modules: true, localIdentName: '[name]__[local]___[hash:base64:5]'}
								},
								{
									loader: 'postcss-loader',
									options: {
										ident: 'postcss',
										plugins: () => [autoprefixer({browsers: ['>1%', 'last 4 versions', 'Firefox ESR', 'not ie < 9']})]
									}
								},
								{
									loader: 'less-loader',
									options: {plugins: ((enact.ri) ? [new LessPluginRi(enact.ri)] : [])}
								}
							]
						})
					}
				],
				noParse: /node_modules\/json-schema\/lib\/validate\.js/
			},
			devServer: {host: '0.0.0.0', port: 8080},
			plugins: [
				new webpack.DefinePlugin({'process.env': {'NODE_ENV': '"development"'}}),
				new ExtractTextPlugin('[name].css'),
				new CaseSensitivePathsPlugin(),
				new GracefulFsPlugin(),
				new ILibPlugin({create: false})
			]
		},

		webpackServer: {
			// please don't spam the console when running in karma!
			noInfo: true,
			progress: false,
			stats: {
				assets: false,
				chunkModules: false,
				chunks: false,
				colors: true,
				errorDetails: false,
				hash: false,
				reasons: false,
				timings: false,
				version: false,
				children: false,
				warnings: false
			}
		},

		plugins: [
			'karma-webpack',
			'karma-mocha',
			'karma-chai',
			'karma-dirty-chai',
			'karma-chrome-launcher',
			'karma-phantomjs-launcher',
			'karma-json-reporter'
		],

		jsonReporter: {
			stdout: true
		},
		port: 9876,
		colors: true,
		logLevel: karma.LOG_INFO,
		autoWatch: true,
		browsers: ['Chrome'],
		singleRun: false
	});
};
