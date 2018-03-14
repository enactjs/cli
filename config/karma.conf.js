const path = require('path');
const autoprefixer = require('autoprefixer');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const flexbugfixes = require('postcss-flexbugs-fixes');
const LessPluginRi = require('resolution-independence');
const {DefinePlugin} = require('webpack');
const {optionParser: app, EnzymeAdapterPlugin, GracefulFsPlugin, ILibPlugin} = require('@enact/dev-utils');

process.env.ES5 = 'true';

module.exports = function(karma) {
	karma.set({
		basePath: process.cwd(),
		frameworks: ['mocha', 'chai', 'dirty-chai'],
		files: [
			require.resolve('@babel/polyfill/dist/polyfill'),
			require.resolve('./proptype-checker'),
			'./!(node_modules|dist|build)/**/*-specs.js'
		],

		preprocessors: {
			// add webpack as preprocessor
			'./!(node_modules|dist|build)/**/*.js': ['webpack'],
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
					path.resolve(app.context, './node_modules'),
					'node_modules',
					// @remove-on-eject-begin
					path.resolve(__dirname, '../node_modules')
					// @remove-on-eject-end
				],
				alias: {
					ilib: '@enact/i18n/ilib/lib',
					'react-addons-test-utils': 'react-dom/test-utils'
				}
			},
			// @remove-on-eject-begin
			resolveLoader: {
				modules: [path.resolve(__dirname, '../node_modules'), path.resolve(app.context, './node_modules')]
			},
			// @remove-on-eject-end
			externals: {
				cheerio: 'window',
				'react/addons': true,
				'react/lib/ExecutionEnvironment': true,
				'react/lib/ReactContext': true
			},
			target: app.environment,
			node: Object.assign({}, app.nodeBuiltins || {}, {
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
							extends: path.join(__dirname, '.babelrc.js'),
							// @remove-on-eject-end
							cacheDirectory: true,
							// Generate a unique identifier string based off versons of components and app config.
							cacheIdentifier: JSON.stringify({
								'babel-loader': require('babel-loader/package.json').version,
								'babel-core': require('@babel/core/package.json').version,
								browsers: app.browsers,
								node: app.node
							})
						}
					},
					{
						test: /\.(c|le)ss$/,
						use: [
							require.resolve('style-loader'),
							{
								loader: require.resolve('css-loader'),
								options: {
									importLoaders: 2,
									modules: true,
									localIdentName: '[name]__[local]___[hash:base64:5]'
								}
							},
							{
								loader: require.resolve('postcss-loader'),
								options: {
									ident: 'postcss',
									plugins: () => [
										autoprefixer({
											browsers: app.browsers,
											flexbox: 'no-2009',
											remove: false
										}),
										flexbugfixes
									]
								}
							},
							{
								loader: require.resolve('less-loader'),
								options: {plugins: app.ri ? [new LessPluginRi(app.ri)] : []}
							}
						]
					}
				],
				noParse: /node_modules\/json-schema\/lib\/validate\.js/
			},
			devServer: {host: '0.0.0.0', port: 8080},
			plugins: [
				new DefinePlugin({'process.env': {NODE_ENV: '"development"'}}),
				new CaseSensitivePathsPlugin(),
				new GracefulFsPlugin(),
				new ILibPlugin({create: false}),
				new EnzymeAdapterPlugin()
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
		client: {
			mocha: {
				timeout: 30000
			}
		},
		port: 9876,
		colors: true,
		logLevel: karma.LOG_INFO,
		browserNoActivityTimeout: 60000,
		autoWatch: true,
		browsers: ['PhantomJS'],
		singleRun: false
	});
};
