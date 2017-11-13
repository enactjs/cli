const
	path = require('path'),
	fs = require('fs'),
	vdomServer = require('./vdom-server-render');

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
		return localesInManifest(path.join('node_modules', '@enact', 'i18n', 'ilib', 'locale', 'ilibmanifest.json'), true);
	} else if(/\.json$/i.test(target)) {
		return JSON.parse(fs.readFileSync(target, {encoding: 'utf8'})).paths;
	} else {
		return target.replace(/-/g, '/').split(',');
	}
}

// Converts from a locale path to a locale code identifier
function locCode(locale) {
	return locale.replace(/[\\/]/g, '-');
}

// Find the location of the root div (can be empty or with contents) and return the
// contents of the HTML before and after it.
function findRootDiv(html, start, end) {
	if(/^<div[^>]+id="root"/i.test(html.substring(start, end+7))) {
		return {before:html.substring(0, start), after:html.substring(end+6)};
	}
	const a = html.indexOf('<div', start+4);
	const b = html.lastIndexOf('</div>', end);
	if(a>=0 && b>=0 && a<b) {
		return findRootDiv(html, a, b);
	}
}

// Scan an ilib manifest and detect all locales that it uses.
function localesInManifest(manifest, deepestOnly) {
	try {
		const meta = JSON.parse(fs.readFileSync(manifest, {encoding:'utf8'}).replace(/-/g, '/'));
		const locales = [];
		let curr;
		for(let i=0; meta.files && i<meta.files.length; i++) {
			curr = path.dirname(meta.files[i]).replace(/\\/g, '/');
			if(locales.indexOf(curr) === -1 && curr.indexOf('mis')!==0 && curr.indexOf('mul')!==0
					&& curr.indexOf('und')!==0 && curr.indexOf('zxx')!==0  && (curr.length === 2
					|| curr.indexOf('/')===2 || curr.length === 3 || curr.indexOf('/')===3)) {
				if(deepestOnly) {
					// Remove any matches of parent directories.
					for(let x=curr; x.indexOf('/')!==-1; x=path.dirname(x)) {
						const index = locales.indexOf(x);
						if(index>=0) {
							locales.splice(index, 1);
						}
					}
					// Only add the entry if children aren't already in the list.
					let childFound = false;
					for(let k=0; k<locales.length && !childFound; k++) {
						childFound = (locales[k].indexOf(curr)===0);
					}
					if(!childFound) {
						locales.push(curr);
					}
				} else {
					locales.push(curr);
				}
			}
		}
		locales.sort((a, b) => a.split('/').length > b.split('/').length);
		return locales;
	} catch(e) {
		return [];
	}
}

// Simplifies and groups the locales and aliases to ensure minimal output needed.
function simplifyAliases(locales, status) {
	const links = {};
	const sharedCSS = {};
	let multiCount = 1;

	// First pass: simplify alias names to language designations or 'multi' for multi-language groupings.
	// Additionally determines all shared root CSS classes for the groupings.
	for(let i=0; i<status.alias.length; i++) {
		if(status.alias[i]) {
			const lang = locales[i].split(/[\\/]+/)[0];
			if(!links[status.alias[i]]) {
				const alias = status.alias[i].split(/[\\/]+/)[0];
				let regionCount = 0;
				for(const x in links) {
					if(links[x]===alias || links[x].indexOf(alias + '.') === 0) {
						regionCount++;
					}
				}
				links[status.alias[i]] = regionCount>0 ? alias + '.' + (regionCount+1) : alias;
			}
			if(links[status.alias[i]].indexOf(lang)!==0 && links[status.alias[i]].indexOf('multi')!==0) {
				if(multiCount>1) {
					links[status.alias[i]] = 'multi.' + multiCount;
				} else {
					links[status.alias[i]] = 'multi';
				}
				multiCount++;
			}

			status.details[i].rootClasses = status.details[i].rootClasses || '';
			if(!sharedCSS[status.alias[i]]) {
				sharedCSS[status.alias[i]] = commonClasses(status.details[i].rootClasses.split(/\s+/),
						status.details[locales.indexOf(status.alias[i])].rootClasses.split(/\s+/));
			} else {
				sharedCSS[status.alias[i]] = commonClasses(sharedCSS[status.alias[i]],
						status.details[i].rootClasses.split(/\s+/));
			}
		}
	}

	// Second pass: with the shared root CSS classes determined, remove from the individual class strings
	// and update the alias names to the new simplified names.
	for(let j=0; j<status.alias.length; j++) {
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

	// For every grouping processed, create new faux-locale entries to generate html files for, and
	// re-insert the common root CSS classes back into the shared prerendered html code.
	for(const l in links) {
		const index = locales.indexOf(l);
		status.alias[index] = links[l];
		status.details[index].rootClasses = removeClasses(sharedCSS[l], status.details[index].rootClasses);
		locales.push(links[l]);
		if(sharedCSS[l] && sharedCSS[l].length>0) {
			status.prerender[locales.length-1] = status.prerender[index]
					.replace(/(<div[^>]*class="[^"]*)"/i, '$1 ' + sharedCSS[l].join(' ') + '"');
		} else {
			status.prerender[locales.length-1] = status.prerender[index];
		}
		status.prerender[index] = undefined;
	}
}

// Determine common matching CSS classes between 2 class lists.
function commonClasses(classes1, classes2) {
	const matches = [];
	for(let i=0; i<classes1.length; i++) {
		if(classes2.indexOf(classes1[i])>=0 && classes1[i].length>0) {
			matches.push(classes1[i]);
		}
	}
	return matches;
}

// Remove target CSS classes from a class string.
function removeClasses(targets, classStr) {
	const classes = classStr.split(/\s+/);
	for(let i=0; i<targets.length; i++) {
		const match = classes.indexOf(targets[i]);
		if(match>=0) {
			classes.splice(match, 1);
			i--;
		}
	}
	return classes.join(' ');
}

// List all indices for locales that match the desired alias.
function aliasedLocales(locale, aliases) {
	const matches = [];
	for(let i=0; i<aliases.length; i++) {
		if(aliases[i]===locale) {
			matches.push(i);
		}
	}
	return matches;
}

function deepWrap(deep, prerender, extra) {
	extra = extra || '';
	return {
		prerender: (deep ? '' : prerender),
		script: (deep ? '\n\t\t\tif(!(' + (Array.isArray(deep) ? deep.join(' && ') : deep) + ')) {'
			+ '\n\t\t\t\tvar divRoot = document.getElementById("root");'
			+ '\n\t\t\t\tif(divRoot) divRoot.innerHTML = ' + JSON.stringify(prerender) +  ';'
			+ extra.replace(/\n/g, '\n\t')
			+ '\n\t\t\t}'
			: (extra || ''))
	}
}

// Add a localized index.html to the compilation assets.
function localizedHtml(i, locales, status, html, compilation, htmlPlugin, deep, callback) {
	if(i===locales.length) {
		callback();
	} else if(!status.prerender[i] || status.alias[i] || status.err[i]) {
		// Non-actionable locale; skip and move on to next one.
		localizedHtml(i+1, locales, status, html, compilation, htmlPlugin, deep, callback);
	} else {
		const locStr = locCode(locales[i]);
		const rootOpen = '<div id="root">';
		const rootClose = '</div>';
		const linked = aliasedLocales(locales[i], status.alias);
		let htmlBefore = html.before;
		status.prerender[i] = status.prerender[i].replace(/<!-- head append start -->([\s\S]*)<!-- head append end -->/, (m, head) => {
			htmlBefore = htmlBefore.replace(/(\s*<\/head>)/, '\n' + head + '$1');
			return '';
		});
		if(linked.length===0) {
			// Single locale, re-inject root classes and react checksum.
			status.prerender[i] = status.prerender[i]
					.replace(/(<div[^>]*class="[^"]*)"/i, '$1' + status.details[i].rootClasses + '"')
					.replace(/(<div[^>]*data-react-checksum=")"/i, '$1' + status.details[i].checksum + '"');
			const result = deepWrap(deep, status.prerender[i]);
			emitAsset(compilation, 'index.' + locStr + '.html', htmlBefore + rootOpen + result.prerender
					+ rootClose + (result.script ? '\n\t\t<script>(function() {' + result.script + '\n\t\t})();</script>' : '') + html.after);
			localizedHtml(i+1, locales, status, html, compilation, htmlPlugin, deep, callback);
		} else {
			// Multiple locales, add script logic to dynamically add root attributes.
			const mapping = {};
			for(let j=0; j<linked.length; j++) {
				mapping[locCode(locales[linked[j]]).toLowerCase()] = status.details[linked[j]];
			}
			if(locStr.indexOf('-')>=0) {
				// Not a shorthand locale, so include it in the map.
				mapping[locStr.toLowerCase()] = status.details[i];
			}
			const wrapped = deepWrap(deep, status.prerender[i],
					'\n\t\t\tvar details = ' + JSON.stringify(mapping, null, '\t').replace(/\n+/g, '\n\t\t\t') + ';'
					+ '\n\t\t\tvar lang = navigator.language.toLowerCase();'
					+ '\n\t\t\tvar conf = details[lang] || details[lang.substring(0, 2)];'
					+ '\n\t\t\tvar reactRoot = document.getElementById("root").children[0];'
					+ '\n\t\t\tif(conf && reactRoot) {'
					+ '\n\t\t\t\treactRoot.className += conf.rootClasses;'
					+ '\n\t\t\t\treactRoot.setAttribute("data-react-checksum", conf.checksum);'
					+ '\n\t\t\t}');

			// Process the script node html to minify it as needed.
			htmlPlugin.postProcessHtml('\n\t\t<script>(function() {' + wrapped.script + '\n\t\t})();</script>', {}, {head:[], body:[]}).then((processedScript) => {
				emitAsset(compilation, 'index.' + locStr + '.html', htmlBefore + rootOpen + wrapped.prerender
						+ rootClose + processedScript + html.after);
				localizedHtml(i+1, locales, status, html, compilation, htmlPlugin, deep, callback);
			});

		}
	}
}

function emitAsset(compilation, file, data) {
	compilation.assets[file] = {
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
	const opts = this.options;
	const status = {prerender:[], details:[], alias:[], failed:[], err:{}};
	const aiOptimize = {groups:{}, coverage:[]};
	let jsAssets = [], locales = [];

	compiler.plugin('compilation', (compilation) => {
		if(isNodeOutputFS(compiler)) {
			// Determine the target locales and load up the startup scripts.
			locales = parseLocales(compiler.options.context, opts.locales);

			// Ensure that any async chunk-loading jsonp functions are isomorphically compatible.
			compilation.mainTemplate.plugin('bootstrap', (source) => {
				return source.replace(/window/g, '(function() { return this; }())');
			});

			// Prerender each locale desired and output an error on failure.
			compilation.plugin('chunk-asset', (chunk, file) => {
				if(file === opts.chunk) {
					compilation.applyPlugins('prerender-chunk', {chunk:opts.chunk, locales:locales});
					vdomServer.stage(compilation.assets[opts.chunk].source(), opts);
					let locStr;
					for(let i=0; i<locales.length; i++) {
						try {
							// Prerender the locale.
							locStr = locCode(locales[i]);
							compilation.applyPlugins('prerender-localized', {chunk:opts.chunk, locale:locStr});
							let appHtml = vdomServer.render({
								server: opts.server,
								locale: locStr,
								externals: opts.externals
							});

							// Extract the root CSS classes and react checksum from the prerendered html code.
							status.details[i] = {};
							appHtml = appHtml.replace(/(<div[^>]*class="((?!enact-locale-)[^"])*)(\senact-locale-[^"]*)"/i, (match, before, s, classAttr) => {
								status.details[i].rootClasses = classAttr;
								return before + '"';
							}).replace(/(<div[^>]*data-react-checksum=")([^"]*)"/i, (match, before, checksum) => {
								status.details[i].checksum = checksum;
								return before + '"';
							});

							// Dedupe the sanitized html code and alias as needed
							const index = status.prerender.indexOf(appHtml);
							if(index===-1) {
								status.prerender[i] = appHtml;
							} else {
								compilation.applyPlugins('prerender-duplicate', {chunk:opts.chunk, locale:locStr});
								status.alias[i] = locales[index];
							}
						} catch(e) {
							status.failed.push(locStr);
							status.err[locales[i]] = e;
						}
					}
					if(status.failed.length===0) vdomServer.unstage();
					// Simplify out aliases and group together for minimal file output.
					simplifyAliases(locales, status);
				}
			});

			// For any target locales that don't already have appinfo files, dynamically generate new ones.
			compilation.plugin('webos-meta-list-localized', (locList) => {
				for(let i=0; i<locales.length; i++) {
					if(!status.err[locales[i]] && locales[i].indexOf('multi')!==0 && !/\.\d+$/.test(locales[i])) {
						// Handle each locale that isn't a multi-language group item and hasn't failed prerendering.
						const lang = locales[i].split(/[\\/]+/)[0];
						let aiFile = path.join('resources', locales[i], 'appinfo.json');
						if(status.alias[i] && status.alias[i].indexOf('multi')===0) {
							// Locale is part of a multi-language grouping.
							if(locales.indexOf(lang)>=0 || (aiOptimize.groups[lang] && aiOptimize.groups[lang]!==status.alias[i])) {
								// Parent language entry already exists, or the appinfo optimization group for this language points
								// to a different alias, so we can't simplify any further.
								if(locList.indexOf(aiFile)===-1) {
									// Add full locale appinfo entry if not already there.
									locList.push({generate: aiFile});
								}
							} else if(!aiOptimize.groups[lang]) {
								// No parent language and no existing appinfo optimization group for this language, so let's
								// create one and simplify the output for the locale.
								aiOptimize.groups[lang] = status.alias[i];
								aiOptimize.coverage.push(locales[i]);
								aiFile = path.join('resources', lang, 'appinfo.json');
								if(locList.indexOf(aiFile)===-1) {
									locList.push({generate: aiFile});
								}
							}
						} else if(status.alias[i]!==lang && locList.indexOf(aiFile)===-1) {
							// Not aliased, or not aliased to parent language so create appinfo if it does not exist.
							locList.push({generate: aiFile});
						}
					}
				}
				return locList;
			});

			// Update any root appinfo to tag as using prerendering to avoid webOS splash screen.
			compilation.plugin('webos-meta-root-appinfo', (meta) => {
				if(typeof meta.usePrerendering === 'undefined' && locales.length>0) {
					meta.usePrerendering = true;
				}
				return meta;
			});

			// For each prerendered target locale's appinfo, update the 'main' value.
			compilation.plugin('webos-meta-localized-appinfo', (meta, info) => {
				let loc = info.locale.replace(/[\\-]+/g, '/');
				// Exclude appinfo entries covered by appinfo optimization groups.
				if(aiOptimize.coverage.indexOf(loc)===-1) {
					const index = locales.indexOf(loc);
					if(index===-1) {
						// When not found in our target list, fallback to our appinfo optimization groups.
						loc = aiOptimize.groups[loc];
					} else if(index>=0 && status.alias[index]) {
						// Resolve any locale aliases.
						loc = status.alias[index];
					}
					if(loc) {
						meta.main = 'index.' + locCode(loc) + '.html';
					}
				}
				return meta;
			});

			// Force HtmlWebpackPlugin to use body inject format and set aside the js assets.
			compilation.plugin('html-webpack-plugin-before-html-processing', (htmlPluginData, callback) => {
				htmlPluginData.plugin.options.inject = 'body';
				jsAssets = htmlPluginData.assets.js;
				htmlPluginData.assets.js = [];
				callback(null, htmlPluginData);
			});

			// Use the prerendered-startup.js to asynchronously add the js assets at load time and embed that
			// script inline in the HTML head.
			compilation.plugin('html-webpack-plugin-alter-asset-tags', (htmlPluginData, callback) => {
				let startup = fs.readFileSync(path.join(__dirname, 'prerendered-startup.txt'), {encoding:'utf8'});
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
			compilation.plugin('html-webpack-plugin-after-html-processing', (htmlPluginData, callback) => {
				const html = findRootDiv(htmlPluginData.html, 0, htmlPluginData.html.length-6);
				if(html) {
					compilation.applyPlugins('locale-html-generate', {chunk:opts.chunk, locales:locales});
					localizedHtml(0, locales, status, html, compilation, htmlPluginData.plugin, opts.deep, () => callback(null, htmlPluginData));
				} else {
					callback(new Error('LocaleHtmlPlugin: Unable find root div element. Please '
							+ 'verify it exists within your HTML template.'), htmlPluginData);
				}
			});
		}
	});

	// Report any failed locale prerenders at the compiler level to fail the build.
	compiler.plugin('after-compile', (compilation, callback) => {
		if(status.failed.length>0) {
			callback(new Error('LocaleHtmlPlugin: Failed to prerender localized HTML for '
					+ status.failed.join(', ')));
		} else {
			// Generate a JSON file that maps the locales to their HTML files.
			if(opts.mapfile && isNodeOutputFS(compiler)) {
				let out = 'locale-map.json';
				if(typeof opts.mapfile === 'string') {
					out = opts.mapfile;
				}

				const mapping = {fallback:'index.html', locales:{}};
				for(let i=0; i<locales.length; i++) {
					if(status.alias.indexOf(locales[i])===-1) {
						const code = locCode(locales[i]);
						if(status.alias[i]) {
							mapping.locales[code] = 'index.' + locCode(status.alias[i]) + '.html';
						} else {
							mapping.locales[code] = 'index.' + code + '.html';
						}
					}
				}
				emitAsset(compilation, out, JSON.stringify(mapping, null, '\t'))
			}
			callback();
		}
	});
};

module.exports = LocaleHtmlPlugin;
