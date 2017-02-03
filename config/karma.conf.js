/* eslint no-var: "off" */

var path = require('path');
var fs = require('fs');
var webpack = require('webpack');
var findCacheDir = require('find-cache-dir');
var autoprefixer = require('autoprefixer');
var LessPluginRi = require('resolution-independence');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var GracefulFsPlugin = require('graceful-fs-webpack-plugin');
var ILibPlugin = require('ilib-webpack-plugin');
var CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return null;
	}
}

var pkg = readJSON('package.json') || {};
var enact = pkg.enact || {};

module.exports = function(karma) {
	karma.set({
		basePath: process.cwd(),
		frameworks: ['mocha', 'chai', 'dirty-chai'],
		files: [
			require.resolve('./polyfills'),
			require.resolve('string.prototype.repeat'),
			require.resolve('./proptype-checker'),
			'./!(node_modules|dist|build)/**/*-specs.js'
		],

		preprocessors: {
			// add webpack as preprocessor
			'./!(node_modules|dist|build)/**/*.js': ['webpack'],
			[require.resolve('./polyfills')]: ['webpack'],
			[require.resolve('string.prototype.repeat')]: ['webpack'],
			[require.resolve('./proptype-checker')]: ['webpack']
		},

		failOnEmptyTestSuite: true,

		webpack: {
			// Use essentially the same webpack config as from the development build setup.
			// We do not include an entry value as Karma will control that.
			devtool: null,
			output: {
				path: './dist',
				filename: '[name].js'
			},
			resolve: {
				extensions: ['', '.js', '.jsx', '.es6'],
				root: [
					// @remove-on-eject-begin
					path.join(__dirname, '..', 'node_modules'),
					// @remove-on-eject-end
					path.resolve('./node_modules')
				],
				alias: {
					'ilib':'@enact/i18n/ilib/lib'
				}
			},
			// @remove-on-eject-begin
			resolveLoader: {
				root: path.resolve(__dirname, '../node_modules')
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
				loaders: [
					{test: /\.(js|jsx|es6)$/, loader: 'babel', exclude: /node_modules.(?!@enact)/,
						query: {
							// @remove-on-eject-begin
							babelrc: false,
							extends: path.join(__dirname, '.babelrc'),
							// @remove-on-eject-end
							cacheDirectory: findCacheDir({
								name: 'enact-dev'
							})
						}
					},
					{test: /\.(c|le)ss$/, loader: ExtractTextPlugin.extract('style',
							'css?-autoprefixer&modules&sourceMap&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]!postcss!less?sourceMap')
					},
					{test: /\.json$/, loader: 'json'},
					{test: /\.(ico|jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2)(\?.*)?$/, loader: 'file',
						query: {
							name: '[path][name].[ext]'
						}
					},
					{test: /\.(mp4|webm|wav|mp3|m4a|aac|oga)(\?.*)?$/, loader: 'url',
						query: {
							limit: 10000,
							name: '[path][name].[ext]'
						}
					}
				],
				noParse: /node_modules\/json-schema\/lib\/validate\.js/
			},
			devServer: {host: '0.0.0.0', port: 8080},
			postcss: function() {
				return [autoprefixer({browsers: ['>1%', 'last 4 versions', 'Firefox ESR', 'not ie < 9']})];
			},
			lessLoader: {
				lessPlugins: ((enact.ri) ? [new LessPluginRi(enact.ri)] : [])
			},
			plugins: [
				new webpack.DefinePlugin({
					'process.env': {
						'NODE_ENV': '"development"'
					}
				}),
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
