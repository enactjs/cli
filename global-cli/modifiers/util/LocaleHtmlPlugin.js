var
	path = require('path'),
	fs = require('fs-extra'),
	requireFromString = require('require-from-string'),
	exists = require('path-exists').sync,
	FileXHR = require('./FileXHR');

require('console.mute');

// Determine if it's a NodeJS output filesystem or if it's a foreign/virtual one.
function isNodeOutputFS(compiler) {
	return (compiler.outputFileSystem
			&& compiler.outputFileSystem.constructor
			&& compiler.outputFileSystem.constructor.name
			&& compiler.outputFileSystem.constructor.name === 'NodeOutputFileSystem');
}

function findLocales(context, target) {
	if(target === 'tv') {
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales-tv.json'), {encoding: 'utf8'})).paths;
	} else if(target === 'signage') {
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales-signage.json'), {encoding: 'utf8'})).paths;
	} else if(target === 'used') {
		return localesInManifest(path.join(context, 'resources', 'ilibmanifest.json'));
	} else if(target === 'all') {
		return localesInManifest('node_modules/@enact/i18n/ilibmanifest');
	} else {
		return target.replace(/-/g, '/').split(',');
	}
}

function localesInManifest(manifest, includeParents) {
	try {
		var meta = JSON.parse(fs.readFileSync(manifest, {encoding:'utf8'}).replace(/-/g, '/'));
		var locales = [];
		var curr, name, index;
		for(var i=0; meta.files && i<meta.files.length; i++) {
			if(includeParents) {
				for(curr = path.dirname(meta.files[i]); curr && curr !== '.'; curr = path.dirname(curr)) {
					if(locales.indexOf(curr) === -1 && (curr.length === 2 || curr.indexOf('/') === 2)) {
						locales.push(curr);
					}
				}
			} else {
				curr = path.dirname(meta.files[i]);
				if(locales.indexOf(curr) === -1 && (curr.length === 2 || curr.indexOf('/') === 2)) {
					locales.push(curr);
				}
			}
		}
		locales.sort(function(a, b) {
			return a.split('/').length > b.split('/').length;
		});
		return locales;
	} catch(e) {
		return [];
	}
}

var htmlFiles = [];
var htmlContents = [];
function prerenderLocale(compilation, html, locale, ReactDOMServer, src) {
	var locStr = locale.replace(/\//g, '-');
	global.publicPath = path.relative(path.join('resources', locale), '.') + '/';
	console.mute();
	var App = requireFromString(src, 'main.' + locStr + '.js');
	if(global.iLibLocale && global.iLibLocale.updateLocale) {
		global.iLibLocale.updateLocale(locStr);
	}
	var code = ReactDOMServer.renderToString(App['default'] || App);
	console.resume();
	var i = htmlContents.indexOf(code);
	fs.mkdirsSync(path.join('resources', locale));
	if(i>-1) {
		updateAppinfo(compilation, path.join('resources', locale, 'appinfo.json'),
				path.relative(path.join('resources', locale), htmlFiles[i]));
	} else {
		var outName = path.join('resources', locale, 'index.html');
		var outputHTML = '<div id="root">' + code + '</div>\n\t\t<script type="text/javascript">window.publicPath = "'
				+ global.publicPath + '";</script>';
		var data = html.replace('<div id="root"></div>', outputHTML);
		data = data.replace(/"([^'"]*\.(js|css))"/g, function(match, file) {
			if(!path.isAbsolute(file)) {
				return '"' + path.relative(path.join('resources', locale), file) + '"';
			} else {
				return '"' + file + '"';
			}
		});
		fs.writeFileSync(path.join(compilation.options.output.path, outName), data, {encoding:'utf8'});
		// add to stats
		compilation.assets[outName] = {
			size: function() { return data.length; },
			source: function() { return data; },
			updateHash: function(hash) { return hash.update(data); },
			map: function() { return null; }
		};
		updateAppinfo(compilation, path.join('resources', locale, 'appinfo.json'),
				path.relative(path.join('resources', locale), outName));
		htmlFiles.push(outName);
		htmlContents.push(code);
	}
}

function updateAppinfo(compilation, file, index) {
	var outFile = path.join(compilation.options.output.path, file);
	var appinfo = {}
	if(exists(outFile)) {
		appinfo = JSON.parse(fs.readFileSync(outFile, {encoding:'utf8'}));
	}
	appinfo.main = index;
	var data = JSON.stringify(appinfo, null, '\t');
	fs.writeFileSync(outFile, data, {encoding:'utf8'});
	// add to compilation stats
	compilation.assets[file] = {
		size: function() { return data.length; },
		source: function() { return data; },
		updateHash: function(hash) { return hash.update(data); },
		map: function() { return null; }
	};
}

function LocaleHtmlPlugin(options) {
	this.options = options || {};
	this.options.locales = this.options.locales || 'used';
}

LocaleHtmlPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	compiler.plugin('after-emit', function(compilation, callback) {
		var err;
		if(opts.template && opts.server && isNodeOutputFS(compiler)) {
			if(!opts.code) {
				opts.code = compilation.assets['main.js'].source();
			}

			FileXHR.compilation = compilation;
			global.XMLHttpRequest = FileXHR;

			try {
				var locales = findLocales(compiler.options.context, opts.locales);
				for(var i=0; i<locales.length; i++) {
					prerenderLocale(compilation, opts.template, locales[i], opts.server, opts.code);
				}
			} catch(e) {
				err = new Error('Failed to prerender locales: ' + (e.message || e));
			}
		}
		callback && callback(err);
	});
};

module.exports = LocaleHtmlPlugin;
