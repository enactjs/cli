/* eslint no-var: "off" */

var
	path = require('path'),
	config = require('./common-config'),
	mixin = require('./mixin');

module.exports = function(opts) {
	var common = config.common({ri:opts.ri});
	return {
		basePath: '',
		frameworks: ['mocha', 'chai', 'dirty-chai'],
		files: [
			require.resolve('babel-polyfill/dist/polyfill'),
			require.resolve('./proptype-checker'),
			'./!(node_modules)/**/*-specs.js'
		],

		preprocessors: {
			// add webpack as preprocessor
			'./!(node_modules)/**/*.js': ['webpack', 'sourcemap'],
			[require.resolve('./proptype-checker')]: ['webpack', 'sourcemap']
		},

		failOnEmptyTestSuite: false,

		webpack: mixin(common, {
			entry: undefined,
			devtool: 'inline-source-map',
			resolve: {
				modulesDirectories: [path.join(__dirname, '..', 'node_modules')]
			},
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
				noParse: /node_modules\/json-schema\/lib\/validate\.js/
			}
		}),

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
		logLevel: opts.karma.LOG_INFO,
		autoWatch: true,
		browsers: ['Chrome'],
		singleRun: false
	};
};
