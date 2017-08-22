const path = require('path');
const {DefinePlugin} = require('webpack');
const autoprefixer = require('autoprefixer');
const flexbugfixes = require('postcss-flexbugs-fixes');
const LessPluginRi = require('resolution-independence');
const GracefulFsPlugin = require('graceful-fs-webpack-plugin');
const ILibPlugin = require('ilib-webpack-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const findProjectRoot = require('../global-cli/modifiers/util/find-project-root');

const appPath = findProjectRoot().path;
const pkg = require(path.resolve(appPath, './package.json'));
const enact = pkg.enact || {};

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
				modules: [
					path.resolve(appPath, './node_modules'),
					'node_modules',
					// @remove-on-eject-begin
					path.resolve(__dirname, '../node_modules')
					// @remove-on-eject-end
				],
				alias: {
					'ilib':'@enact/i18n/ilib/lib',
					'react-addons-test-utils':'react-dom/test-utils'
				}
			},
			// @remove-on-eject-begin
			resolveLoader: {
				modules: [
					path.resolve(__dirname, '../node_modules'),
					path.resolve(appPath, './node_modules')
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
						exclude: /\.(html|js|jsx|css|less|ejs|json|txt)$/,
						loader: require.resolve('file-loader'),
						options: {name: '[path][name].[ext]'}
					},
					{
						test: /\.(html|txt)$/,
						loader: require.resolve('raw-loader')
					},
					{
						test: /\.(js|jsx)$/,
						exclude: /node_modules.(?!@enact)/,
						loader: require.resolve('babel-loader'),
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
						use: [
							require.resolve('style-loader'),
							{
								loader: require.resolve('css-loader'),
								options: {importLoaders: 2, modules: true, localIdentName: '[name]__[local]___[hash:base64:5]'}
							},
							{
								loader: require.resolve('postcss-loader'),
								options: {
									ident: 'postcss',
									plugins: () => [autoprefixer({
										browsers: ['>1%', 'last 4 versions', 'Firefox ESR', 'not ie < 9'], flexbox: 'no-2009', remove:false
									}), flexbugfixes]
								}
							},
							{
								loader: require.resolve('less-loader'),
								options: {plugins: ((enact.ri) ? [new LessPluginRi(enact.ri)] : [])}
							}
						]
					}
				],
				noParse: /node_modules\/json-schema\/lib\/validate\.js/
			},
			devServer: {host: '0.0.0.0', port: 8080},
			plugins: [
				new DefinePlugin({'process.env': {'NODE_ENV': '"development"'}}),
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
				warnings: false,
				moduleTrace: false
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
		browserNoActivityTimeout : 60000,
		autoWatch: true,
		browsers: ['Chrome'],
		singleRun: false
	});
};
