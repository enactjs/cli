/* eslint no-var: "off" */

var path = require('path');
var fs = require('fs');
var webpack = require('webpack');
var findCacheDir = require('find-cache-dir');
var autoprefixer = require('autoprefixer');
var LessPluginRi = require('resolution-independence');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var GracefulFsPlugin = require('graceful-fs-webpack-plugin');
var WebOSMetaPlugin = require('webos-meta-webpack-plugin');
var CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return undefined;
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
			require.resolve('./proptype-checker'),
			'./!(node_modules)/**/*-specs.js'
		],

		preprocessors: {
			// add webpack as preprocessor
			'./!(node_modules)/**/*.js': ['webpack', 'sourcemap'],
			[require.resolve('./polyfills')]: ['webpack', 'sourcemap'],
			[require.resolve('./proptype-checker')]: ['webpack', 'sourcemap']
		},

		failOnEmptyTestSuite: false,

		webpack: {
			// Use essentially the same webpack config as from the development build setup.
			// We do not include an entry value as Karma will control that.
			devtool: 'inline-source-map',
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
			node: {
				console: true,
				fs: 'empty',
				net: 'empty',
				tls: 'empty'
			},
			module: {
				loaders: [
					{test: /\.(js|jsx|es6)$/, loader: 'babel', exclude: /node_modules.(?!@*enact)/,
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
					{test: /ilibmanifest\.json$/, loader: 'ilib'},
					{test: /\.json$/, loader: 'json', exclude: /ilibmanifest\.json$/},
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
			devServer: {host: '0.0.0.0', port: 8080, stats: 'errors-only'},
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
				new WebOSMetaPlugin()
			]
		},

		webpackServer: {
			noInfo: true // please don't spam the console when running in karma!
		},

		plugins: [
			'karma-webpack',
			'karma-mocha',
			'karma-chai',
			'karma-dirty-chai',
			'karma-sourcemap-loader',
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
