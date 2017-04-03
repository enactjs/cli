var
	path = require('path'),
	fs = require('fs'),
	vdomRender = require('./vdom-server-render');

// Determine if it's a NodeJS output filesystem or if it's a foreign/virtual one.
function isNodeOutputFS(compiler) {
	return (compiler.outputFileSystem
			&& compiler.outputFileSystem.constructor
			&& compiler.outputFileSystem.constructor.name
			&& compiler.outputFileSystem.constructor.name === 'NodeOutputFileSystem');
}

// Determine the desired target locales based of option content.
// Can be a preset like 'tv' or 'signage', 'used' for all used app-level locales, 'all' for
// all locales supported by ilib, a custom json file input, or a comma-separated lists
function parseLocales(context, target) {
	if(!target || target === 'none') {
		return [];
	} else if(Array.isArray(target)) {
		return target;
	} else if(target === 'tv' || target === 'tv-osd') {
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales-tv-osd.json'), {encoding: 'utf8'})).paths;
	} else if(target === 'tv-full') {
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales-tv.json'), {encoding: 'utf8'})).paths;
	} else if(target === 'signage') {
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales-signage.json'), {encoding: 'utf8'})).paths;
	} else if(target === 'used') {
		return localesInManifest(path.join(context, 'resources', 'ilibmanifest.json'));
	} else if(target === 'all') {
		return localesInManifest('node_modules/@enact/i18n/ilibmanifest');
	} else if(/\.json$/i.test(target)) {
		return JSON.parse(fs.readFileSync(target, {encoding: 'utf8'})).paths;
	} else {
		return target.replace(/-/g, '/').split(',');
	}
}

// Find the location of the root div (can be empty or with contents) and return the
// contents of the HTML before and after it.
function findRootDiv(html, start, end) {
	if(/^<div[^>]+id="root"/i.test(html.substring(start, end+7))) {
		return {before:html.substring(0, start), after:html.substring(end+6)};
	}
	var a = html.indexOf('<div', start+4);
	var b = html.lastIndexOf('</div>', end);
	if(a>=0 && b>=0 && a<b) {
		return findRootDiv(html, a, b);
	}
}

// Scan an ilib manifest and  detect all locales that it uses.
function localesInManifest(manifest, includeParents) {
	try {
		var meta = JSON.parse(fs.readFileSync(manifest, {encoding:'utf8'}).replace(/-/g, '/'));
		var locales = [];
		var curr;
		for(var i=0; meta.files && i<meta.files.length; i++) {
			if(includeParents) {
				for(curr = path.dirname(meta.files[i]); curr && curr !== '.'; curr = path.dirname(curr)) {
					if(locales.indexOf(curr) === -1 && (curr.length === 2 || curr.indexOf('/') === 2
							|| curr.indexOf('\\') === 2)) {
						locales.push(curr.replace(/\\/g, '/'));
					}
				}
			} else {
				curr = path.dirname(meta.files[i]).replace(/\\/g, '/');
				if(locales.indexOf(curr) === -1 && (curr.length === 2 || curr.indexOf('/'))) {
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

// Add a localized index.html to the compilation assets.
function localizedHtmlAsset(compilation, locale, data) {
	compilation.assets['index.' + locale.replace(/[\\\/]/g, '-') + '.html'] = {
		size: function() { return data.length; },
		source: function() { return data; },
		updateHash: function(hash) { return hash.update(data); },
		map: function() { return null; }
	};
}

function LocaleHtmlPlugin(options) {
	this.options = options || {};
	this.options.chunk = this.options.chunk || 'main.js';
	if(typeof this.options.locales === 'undefined') {
		this.options.locales = 'used';
	}
}

LocaleHtmlPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	var status = {prerender:{}, failed:[], err:{}};
	var jsAssets = [];

	// Determine the target locales and load up the startup scripts.
	var locales = parseLocales(compiler.options.context, opts.locales);

	// Prerender each locale desired and output an error on failure.
	compiler.plugin('compilation', function(compilation) {
		if(isNodeOutputFS(compiler)) {
			compilation.plugin('chunk-asset', function(chunk, file) {
				if(file === opts.chunk) {
					compilation.applyPlugins('prerender-chunk', {chunk:opts.chunk, locales:locales});
					var src = compilation.assets[opts.chunk].source(), locStr;
					for(var i=0; i<locales.length; i++) {
						try {
							locStr = locales[i].replace(/[\\\/]/g, '-');
							compilation.applyPlugins('prerender-localized', {chunk:opts.chunk, locale:locStr});
							status.prerender[locales[i]] = vdomRender({
								server: opts.server,
								code: src,
								locale: locStr,
								file: opts.chunk.replace(/\.js$/, '.' + locStr + '.js'),
								externals: opts.externals
							});
						} catch(e) {
							status.failed.push(locStr);
							status.err[locales[i]] = e;
						}
					}
				}
			});

			// For any target locales that don't already have appinfo files, dynamically generate new ones.
			compilation.plugin('webos-meta-list-localized', function(locList) {
				for(var i=0; i<locales.length; i++) {
					if(!status.err[locales[i]] && locList.indexOf(locales[i])===-1) {
						locList.push({generate:path.join('resources', locales[i], 'appinfo.json')});
					}
				}
				return locList;
			});

			// For each prerendered target locale's appinfo, update the 'main' and 'usePrerendering' values.
			compilation.plugin('webos-meta-localized-appinfo', function(meta, info) {
				// TODO: update webos-meta-webpack-plugin to replace '\' with '/' in info.locale
				var locCode = info.locale.replace(/\\/g, '/');
				if(locales.indexOf(locCode)>=0 && !status.err[locCode]) {
					meta.main = 'index.' + info.locale.replace(/[\\\/]/g, '-') + '.html';
					meta.usePrerendering = true;
				}
				return meta;
			});

			// Force HtmlWebpackPlugin to use body inject format and set aside the js assets.
			compilation.plugin('html-webpack-plugin-before-html-processing', function(htmlPluginData, callback) {
				htmlPluginData.plugin.options.inject = 'body';
				jsAssets = htmlPluginData.assets.js;
				htmlPluginData.assets.js = [];
				callback(null, htmlPluginData);
			});

			// Use the prerendered-startup.js to asynchronously add the js assets at load time and embed that
			// script inline in the HTML head.
			compilation.plugin('html-webpack-plugin-alter-asset-tags', function(htmlPluginData, callback) {
				var startup = fs.readFileSync(path.join(__dirname, 'prerendered-startup.txt'), {encoding:'utf8'});
				startup = startup.replace('%SCREENTYPES%', JSON.stringify(opts.screenTypes))
						.replace('%JSASSETS%', JSON.stringify(jsAssets));
				htmlPluginData.head.unshift({
					tagName: 'script',
					closeTag: true,
					attributes: {
						type: 'text/javascript'
					},
					innerHTML: startup
				});
				callback(null, htmlPluginData);
			});

			// Generate an isomorphic HTML template and insert the prerendered locales with it into locale-specific
			// index.html files. Afterward, generate and updated root HTML template for fallback.
			compilation.plugin('html-webpack-plugin-after-html-processing', function(htmlPluginData, callback) {
				var tokens = findRootDiv(htmlPluginData.html, 0, htmlPluginData.html.length-6);
				if(tokens) {
					compilation.applyPlugins('locale-html-generate', {chunk:opts.chunk, locales:locales});
					for(var i=0; i<locales.length; i++) {
						if(!status.err[locales[i]]) {
							localizedHtmlAsset(compilation, locales[i], tokens.before + '<div id="root">'
									+ status.prerender[locales[i]] + '</div>' + tokens.after);
						}
					}
					callback(null, htmlPluginData);
				} else {
					callback(new Error('LocaleHtmlPlugin: Unable find root div element. Please '
							+ 'verify it exists within your HTML template.'), htmlPluginData);
				}
			});
		}
	});

	// Report any failed locale prerenders at the compiler level to fail the build.
	compiler.plugin('after-compile', function(compilation, callback) {
		if(status.failed.length>0) {
			callback(new Error('LocaleHtmlPlugin: Failed to prerender localized HTML for '
					+ status.failed.join(', ')));
		} else {
			callback();
		}
	});
};

module.exports = LocaleHtmlPlugin;
