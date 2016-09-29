var
	path = require('path'),
	fs = require('fs'),
	appConfig = require('./src/app-config'),
	isoConfig = require('./src/iso-config'),
	containerConfig = require('./src/container-app-config'),
	libConfig = require('./src/library-config'),
	karmaConfig = require('./src/karma-config'),
	mixin = require('./src/mixin'),
	entrypoint = require('./src/entrypoint');

var opts;
try {
	var obj = JSON.parse(fs.readFileSync('./package.json', {encoding:'utf8'}));
	opts = obj.enact || {};
} catch(e) {
	opts = {};
}

var customProps = ['name', 'title', 'namedLibs', 'ri', 'htmlTemplate', 'prerender', 'alwaysPrerender', 'screenTypes'];

var setup = function(config, overrides, entryDeps) {
	for(var i=0; i<customProps.length; i++) {
		// ignore our custom properties; assume they've been used directly
		delete overrides[customProps[i]];
	}
	var updatedConfig = mixin(config, overrides);
	updatedConfig.entry = entrypoint(updatedConfig.entry, entryDeps);
	return updatedConfig;
};

module.exports = {
	app: function(args) {
		opts = mixin(opts, args || {});
		if(process.env.ENYO_CONTAINER) {
			opts.namedLibs = process.env.ENYO_CONTAINER.split(',');
			return this.container(opts);
		} else {
			var app = appConfig(opts);
			var iso = (opts.prerender && (process.argv.indexOf('-p')>-1 || opts.alwaysPrerender)) ? isoConfig(opts) : null;
			var entries = [require.resolve('babel-polyfill')];
			if(process.argv.indexOf('-p')==-1) {
				entries.push(require.resolve('react-addons-perf'));
			}
			var out = [setup(app, opts, entries)];
			if(iso) {
				out.unshift(mixin(iso, opts));
			}
			return out.length===1 ? out[0] : out;
		}
	},
	container: function(args) {
		opts = mixin(opts, args || {});
		var c = containerConfig(opts);
		return setup(c, opts, []);
	},
	library: function(args) {
		opts = mixin(opts, args || {});
		var c = libConfig(opts);
		return setup(c, opts, []);
	},
	karma: function(args) {
		opts = mixin(opts, args || {});
		return (function(karmaObj) {
			var c = karmaConfig({karma:karmaObj, ri:opts.ri});
			karmaObj.set(mixin(c, opts || {}));
		});
	},
	eslint: require('eslint-config-enact'),
	babelrc: path.join(__dirname, 'src', '.babelrc'),
	webpack: require('webpack'),
	ExtractTextPlugin: require('extract-text-webpack-plugin'),
	HtmlWebpackPlugin: require('html-webpack-plugin'),
	NamedLibraryPlugin: require('./src/NamedLibraryPlugin'),
	NamedLibraryRefPlugin: require('./src/NamedLibraryRefPlugin'),
	LessPluginRi: require('resolution-independence')
};
