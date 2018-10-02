/* eslint-env node, es6 */
const path = require('path');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const LessPluginRi = require('resolution-independence');
const {DefinePlugin, EnvironmentPlugin} = require('webpack');
const {optionParser: app, EnzymeAdapterPlugin, GracefulFsPlugin, ILibPlugin} = require('@enact/dev-utils');

process.env.ES5 = 'true';
app.setEnactTargetsAsDefault();

module.exports = function(karma) {
	karma.set({
		basePath: process.cwd(),
		frameworks: ['mocha', 'chai'],
		files: [
			require.resolve('@babel/polyfill/dist/polyfill'),
			require.resolve('dirty-chai'),
			require.resolve('mocha-react-proptype-checker'),
			'./!(node_modules|dist|build)/**/*-specs.js'
		],

		preprocessors: {
			// add webpack as preprocessor
			'./!(node_modules|dist|build)/**/*.js': ['webpack'],
			[require.resolve('mocha-react-proptype-checker')]: ['webpack']
		},

		failOnEmptyTestSuite: true,

		webpack: {
			// Use essentially the same webpack config as from the development build setup.
			// We do not include an entry value as Karma will control that.
			mode: 'development',
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
					'react-addons-test-utils': 'react-dom/test-utils',
					sinon: require.resolve('sinon/pkg/sinon-no-sourcemaps.js')
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
							extends: path.join(__dirname, '.babelrc.js'),
							babelrc: false,
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
										require('postcss-preset-env')({
											autoprefixer: {
												flexbox: 'no-2009',
												remove: false
											},
											stage: 3
										}),
										require('postcss-flexbugs-fixes'),
										require('postcss-global-import')
									]
								}
							},
							{
								loader: require.resolve('less-loader'),
								options: {
									modifyVars: Object.assign({}, app.accent),
									plugins: app.ri ? [new LessPluginRi(app.ri)] : []
								}
							}
						]
					}
				],
				noParse: /node_modules\/json-schema\/lib\/validate\.js/
			},
			devServer: {host: '0.0.0.0', port: 8080},
			performance: {hints: false},
			plugins: [
				new DefinePlugin({'process.env.NODE_ENV': JSON.stringify('development')}),
				new EnvironmentPlugin(Object.keys(process.env).filter(key => /^REACT_APP_/.test(key))),
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
			stats: 'errors-only'
		},
		plugins: [
			'karma-webpack',
			'karma-mocha',
			'karma-chai',
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
