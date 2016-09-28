var
	path = require('path'),
	fs = require('fs'),
	webpack = require('webpack'),
	ExtractTextPlugin = require('extract-text-webpack-plugin'),
	HtmlWebpackPlugin = require('html-webpack-plugin'),
	GracefulFsPlugin = require('./GracefulFsPlugin.js'),
	QuietPlugin = require('./QuietPlugin.js'),
	LessPluginRi = require('resolution-independence'),
	utils = require('./utils');

var dev = {
	devtool:'sourcemap',
	cssLoader:'css?modules&sourceMap&importLoaders=1&localIdentName=[path]___[name]__[local]___[hash:base64:5]!less?sourceMap',
	babelCache:true,
	NODE_ENV:'"development"',
	bail:false
};
var prod = {
	devtool:null,
	cssLoader:'css?modules&importLoaders=1!less',
	babelCache:false,
	NODE_ENV:'"production"',
	bail:true
};

var isDev = !(process.argv.indexOf('-p')>-1);
var spec = isDev ? dev : prod;

function pkgMain(pkg) {
	try {
		var obj = JSON.parse(fs.readFileSync(pkg, {encoding:'utf8'}));
		obj.main = obj.main || './index.js';
		if(obj.main.indexOf('.')!==0) {
			obj.main = './' + obj.main;
		}
		return obj.main;
	} catch(e) {
		return './index.js';
	}
}

module.exports = {
	common: function(opts) {
		var config = {
			entry: pkgMain('./package.json'),
			output: {
				path: './dist',
				filename: '[name].js'
			},
			bail: spec.bail,
			devtool: (opts.noEmit ? null : spec.devtool),
			resolve: {
				alias: {
					'ilib':'@enact/i18n/ilib/lib',
					'webpack/hot/dev-server': require.resolve('webpack/hot/dev-server')
				},
				root: [path.resolve('./node_modules')],
				extensions: ['', '.js', '.jsx', '.es6'],
				modulesDirectories: ['web_modules', 'node_modules']
			},
			resolveLoader: {
				modulesDirectories: ['web_loaders', 'web_modules', 'node_loaders', 'node_modules', path.join(__dirname, '..', 'node_modules')]
			},
			module: {
				loaders: [
					{
						test: /appinfo\.json$/,
						loader: 'webos-meta' + (opts.noEmit ? '?noEmit=true' : '')
					},
					{
						test: /ilibmanifest\.json$/,
						loader: 'ilib' + (opts.noEmit ? '?noEmit=true' : '')
					},
					{
						test: /\.json$/,
						exclude: [/appinfo\.json$/, /ilibmanifest\.json$/],
						loader: 'json'
					},
					{
						test: /\.jpe?g$|\.gif$|\.png$|\.svg$|\.woff$|\.ttf$|\.wav$|\.mp3$/,
						loader: 'file?name=[path][name].[ext]' + (opts.noEmit ? '&emitFile=false' : '')
					},
					{
						test:/\.(c|le)ss$/,
						loader: (opts.noEmit ? spec.cssLoader.replace('css', 'css/locals').replace(/.sourceMap/g, '') : ExtractTextPlugin.extract('style', spec.cssLoader))
					},
					{
						test: /\.js$|\.es6$|\.jsx$/, loader: 'babel', exclude: /node_modules.(?!@*enact)/, query: {
							extends: path.join(__dirname, '.babelrc'),
							cacheDirectory: spec.babelCache
						}
					}
				]
			},
			devServer: {
				host: '0.0.0.0',
				port: 8080
			},
			lessLoader: {
				lessPlugins: ((opts.ri) ? [new LessPluginRi(opts.ri)] : [])
			},
			plugins: [
				//new webpack.NoErrorsPlugin(),
				new webpack.optimize.OccurrenceOrderPlugin(),
				new webpack.optimize.DedupePlugin(),
				new webpack.DefinePlugin({
					'process.env': {
						'NODE_ENV': spec.NODE_ENV
					}
				}),
				new GracefulFsPlugin(),
				new QuietPlugin({
					keys: [
						'extract-text-webpack-plugin',
						'html-webpack-plugin for "index.html"'
					]
				}),
				new ExtractTextPlugin(opts.css || '[name].css')
			]
		};
		if(opts.noEmit) {
			config.plugins.splice(config.plugins.length-1, 1);
		}
		if(utils.exists(path.join('node_modules', 'enact'))) {
			config.resolve.alias['@enact'] = 'enact/packages';
		}
		return config;
	},
	isDev: isDev
};
