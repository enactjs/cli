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
	} else if(target === 'tv-osd') {
		return JSON.parse(fs.readFileSync(path.join(__dirname, 'locales-tv-osd.json'), {encoding: 'utf8'})).paths;
	} else if(target === 'tv') {
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

function locCode(locale) {
	return locale.replace(/[\\\/]/g, '-');
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

function simplifyAliases(locales, status) {
	var links = {};
	var sharedCSS = {};
	var multiCount = 1;
	for(var i=0; i<status.alias.length; i++) {
		if(status.alias[i]) {
			var lang = locales[i].split(/[\\\/]+/)[0];
			links[status.alias[i]] = links[status.alias[i]] || status.alias[i].split(/[\\\/]+/)[0];
			if(links[status.alias[i]]!==lang && links[status.alias[i]].indexOf('multi')!==0) {
				if(multiCount>1) {
					links[status.alias[i]] = 'multi' + multiCount;
				} else {
					links[status.alias[i]] = 'multi';
				}
				multiCount++;
			}

			status.details[i].rootClasses = status.details[i].rootClasses || '';
			if(!sharedCSS[status.alias[i]]) {
				sharedCSS[status.alias[i]] = status.details[i].rootClasses.split(/\s+/);
			} else {
				sharedCSS[status.alias[i]] = commonClasses(sharedCSS[status.alias[i]],
						status.details[i].rootClasses.split(/\s+/));
			}
		}
	}
	for(var j=0; j<status.alias.length; j++) {
		if(status.alias[j]) {
			if(sharedCSS[status.alias[j]]) {
				status.details[j].rootClasses = removeClasses(sharedCSS[status.alias[j]],
						status.details[j].rootClasses);
			}

			if(links[status.alias[j]]) {
				status.alias[j] = links[status.alias[j]];
			}
		}
	}
	for(var l in links) {
		var index = locales.indexOf(l);
		status.alias[index] = links[l];
		status.details[index].rootClasses = removeClasses(sharedCSS[l], status.details[index].rootClasses);
		locales.push(links[l]);
		if(sharedCSS[l] && sharedCSS[l].length>0) {
			status.prerender[locales.length-1] = status.prerender[index]
					.replace(/^(<[^>]*class="[^"]*)"/i, '$1 ' + sharedCSS[l].join(' ') + '"');
		} else {
			status.prerender[locales.length-1] = status.prerender[index];
		}
		status.prerender[index] = undefined;
	}
}

function commonClasses(classes1, classes2) {
	var matches = [];
	for(var i=0; i<classes1.length; i++) {
		if(classes2.indexOf(classes1[i])>=0 && classes1[i].length>0) {
			matches.push(classes1[i]);
		}
	}
	return matches;
}

function removeClasses(targets, classStr) {
	var classes = classStr.split(/\s+/);
	for(var i=0; i<targets.length; i++) {
		var match = classes.indexOf(targets[i]);
		if(match>=0) {
			classes.splice(match, 1);
			i--;
		}
	}
	return classes.join(' ');
}

function aliasedLocales(locale, aliases) {
	var matches = [];
	for(var i=0; i<aliases.length; i++) {
		if(aliases[i]===locale) {
			matches.push(i);
		}
	}
	return matches;
}

// Add a localized index.html to the compilation assets.
function localizedHtml(i, locales, status, html, compilation, htmlPlugin, callback) {
	if(i===locales.length) {
		callback();
	} else if(!status.prerender[i] || status.alias[i] || status.err[i]) {
		localizedHtml(i+1, locales, status, html, compilation, htmlPlugin, callback);
	} else {
		var locStr = locCode(locales[i]);
		var rootOpen = '<div id="root">';
		var rootClose = '</div>';
		var linked = aliasedLocales(locales[i], status.alias);
		if(linked.length===0) {
			// Single locale, re-inject root classes and react checksum/
			status.prerender[i] = status.prerender[i]
					.replace(/^(<[^>]*class="[^"]*)"/i, '$1' + status.details[i].rootClasses + '"')
					.replace(/^(<[^>]*data-react-checksum=")"/i, '$1' + status.details[i].checksum + '"');
			addHtmlAsset(compilation, locStr, html.before + rootOpen + status.prerender[i] + rootClose + html.after);
			localizedHtml(i+1, locales, status, html, compilation, htmlPlugin, callback);
		} else {
			// Multiple locales, add script logic to dynamically add root attributes/
			var map = {};
			for(var j=0; j<linked.length; j++) {
				map[locCode(locales[linked[j]]).toLowerCase()] = status.details[linked[j]];
			}
			if(locStr.indexOf('-')>=0) {
				// Not a shorthand locale, so include it in the map.
				map[locStr.toLowerCase()] = status.details[i];
			}
			var script = '\n\t\t<script>(function() {'
					+ '\n\t\t\tvar details = ' + JSON.stringify(map, null, '\t').replace(/\n+/g, '\n\t\t\t') + ';'
					+ '\n\t\t\tvar lang = navigator.language.toLowerCase();'
					+ '\n\t\t\tvar conf = details[lang] || details[lang.substring(0, 2)];'
					+ '\n\t\t\tvar reactRoot = document.getElementById("root").children[0];'
					+ '\n\t\t\tif(conf && reactRoot) {'
					+ '\n\t\t\t\treactRoot.className += conf.rootClasses;'
					+ '\n\t\t\t\treactRoot.setAttribute("data-react-checksum", conf.checksum);'
					+ '\n\t\t\t}'
					+ '\n\t\t})();</script>';
			htmlPlugin.postProcessHtml(script, {}, {head:[], body:[]}).then(function(procssedScript) {
				addHtmlAsset(compilation, locStr, html.before + rootOpen + status.prerender[i] + rootClose
						+ procssedScript + html.after);
				localizedHtml(i+1, locales, status, html, compilation, htmlPlugin, callback);
			});

		}
	}
}

/*
function debug(locales, status) {
	for(var i=0; i<locales.length; i++) {
		console.log(i + '\t' + locales[i] + '\t' + status.alias[i]);
	}
}
*/

function addHtmlAsset(compilation, loc, data) {
	compilation.assets['index.' + loc + '.html'] = {
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
	var status = {prerender:[], details:[], alias:[], failed:[], err:{}};
	var aiOptimize = {groups:{}, coverage:[]};
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
							locStr = locCode(locales[i]);
							compilation.applyPlugins('prerender-localized', {chunk:opts.chunk, locale:locStr});
							var appHtml = vdomRender({
								server: opts.server,
								code: src,
								locale: locStr,
								file: opts.chunk.replace(/\.js$/, '.' + locStr + '.js'),
								externals: opts.externals
							});
							status.details[i] = {};
							appHtml = appHtml.replace(/^(<[^>]*class="((?!enact-locale-)[^"])*)(\senact-locale-[^"]*)"/i, function(match, before, s, classAttr) {
								status.details[i].rootClasses = classAttr;
								return before + '"';
							}).replace(/^(<[^>]*data-react-checksum=")([^"]*)"/i, function(match, before, checksum) {
								status.details[i].checksum = checksum;
								return before + '"';
							});
							var index = status.prerender.indexOf(appHtml);
							if(index===-1) {
								status.prerender[i] = appHtml;
							} else {
								compilation.applyPlugins('prerender-duplicate', {chunk:opts.chunk, locale:locales[i]});
								status.alias[i] = locales[index];
							}
						} catch(e) {
							status.failed.push(locStr);
							status.err[locales[i]] = e;
						}
					}
					try {
						simplifyAliases(locales, status);
					} catch(e) {
						console.log(e);
					}
				}
			});

			// For any target locales that don't already have appinfo files, dynamically generate new ones.
			compilation.plugin('webos-meta-list-localized', function(locList) {
				for(var i=0; i<locales.length; i++) {
					if(!status.err[locales[i]] && locales[i].indexOf('multi')!==0) {
						var lang = locales[i].split(/[\\\/]+/)[0];
						if(status.alias[i] && status.alias[i].indexOf('multi')===0) {
							if(locales.indexOf(lang)>=0 || (aiOptimize.groups[lang] && aiOptimize.groups[lang]!==status.alias[i])) {
								// Language entry exists, so we have to use full locale appinfo.json
								if(locList.indexOf(locales[i])===-1) {
									locList.push({generate:path.join('resources', locales[i], 'appinfo.json')});
								}
							} else if(!aiOptimize.groups[lang]) {
								aiOptimize.groups[lang] = status.alias[i];
								aiOptimize.coverage.push(locales[i]);
								locList.push({generate:path.join('resources', lang, 'appinfo.json')});
							}
						} else if(status.alias[i]!==lang && locList.indexOf(locales[i])===-1) {
							// Not aliased, or not aliased to parent language
							// OR aliased to a multi-language index.html, so create appinfo if not exists
							locList.push({generate:path.join('resources', locales[i], 'appinfo.json')});
						}
					}
				}
				return locList;
			});

			// For each prerendered target locale's appinfo, update the 'main' and 'usePrerendering' values.
			compilation.plugin('webos-meta-localized-appinfo', function(meta, info) {
				// TODO: update webos-meta-webpack-plugin to replace '\' with '/' in info.locale
				var loc = info.locale.replace(/\\/g, '/');
				if(aiOptimize.coverage.indexOf(loc)===-1) {
					var index = locales.indexOf(loc);
					if(index===-1) {
						loc = aiOptimize.groups[loc];
					} else if(index>=0 && status.alias[index]) {
						loc = status.alias[index];
					}
					if(loc) {
						meta.main = 'index.' + locCode(loc) + '.html';
						meta.usePrerendering = true;
					}
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
				var html = findRootDiv(htmlPluginData.html, 0, htmlPluginData.html.length-6);
				if(html) {
					compilation.applyPlugins('locale-html-generate', {chunk:opts.chunk, locales:locales});
					localizedHtml(0, locales, status, html, compilation, htmlPluginData.plugin, function() {
						callback(null, htmlPluginData);
					})
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
