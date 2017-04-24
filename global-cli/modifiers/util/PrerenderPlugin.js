var
	fs = require('fs'),
	path = require('path'),
	chalk = require('chalk'),
	vdomServer = require('./vdom-server-render');

// Determine if it's a NodeJS output filesystem or if it's a foreign/virtual one.
function isNodeOutputFS(compiler) {
	return (compiler.outputFileSystem
			&& compiler.outputFileSystem.constructor
			&& compiler.outputFileSystem.constructor.name
			&& compiler.outputFileSystem.constructor.name === 'NodeOutputFileSystem');
}

// Replace the contents of the root div in an HTML string.
function replaceRootDiv(html, start, end, replacement) {
	if(/^<div[^>]+id="root"/i.test(html.substring(start, end+7))) {
		return html.substring(0, start) + replacement + html.substring(end+6);
	}
	var a = html.indexOf('<div', start+4);
	var b = html.lastIndexOf('</div>', end);
	if(a>=0 && b>=0 && a<b) {
		return replaceRootDiv(html, a, b, replacement);
	}
}

function PrerenderPlugin(options) {
	this.options = options || {};
	this.options.chunk = this.options.chunk || 'main.js';
}

PrerenderPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	var status = {};
	var jsAssets = [];

	// Prerender the desired chunk asset when it's created.
	compiler.plugin('compilation', function(compilation) {
		if(isNodeOutputFS(compiler)) {
			compilation.plugin('chunk-asset', function(chunk, file) {
				if(file === opts.chunk) {
					try {
						compilation.applyPlugins('prerender-chunk', {chunk:opts.chunk});
						status.prerender = vdomServer.render({
							server: opts.server,
							code: vdomServer.prepare(compilation.assets[opts.chunk].source(), opts),
							file: opts.chunk,
							externals: opts.externals
						});
					} catch(e) {
						// Report error but continue executing without prerendering.
						status.err = e;
						console.log();
						console.log(chalk.yellow('Unable to generate prerender of app state HTML'));
						if(e.stack) {
							console.log(e.stack);
						} else {
							console.log('Reason: ' + e.message || e);
						}
						console.log();
						console.log('Continuing build without prerendering...');
					}
				}
			});

			// Update any root appinfo to tag as using prerendering to avoid webOS splash screen.
			compilation.plugin('webos-meta-root-appinfo', function(meta) {
				if(!status.err) {
					meta.usePrerendering = true;
				}
				return meta;
			});

			// Force HtmlWebpackPlugin to use body inject format and set aside the js assets.
			compilation.plugin('html-webpack-plugin-before-html-processing', function(htmlPluginData, callback) {
				if(!status.err) {
					htmlPluginData.plugin.options.inject = 'body';
					jsAssets = htmlPluginData.assets.js;
					htmlPluginData.assets.js = [];
				}
				callback(null, htmlPluginData);
			});

			// Use the prerendered-startup.js to asynchronously add the js assets at load time and embed that
			// script inline in the HTML head.
			compilation.plugin('html-webpack-plugin-alter-asset-tags', function(htmlPluginData, callback) {
				if(!status.err) {
					var startup = fs.readFileSync(path.join(__dirname, 'prerendered-startup.txt'), {encoding:'utf8'});
					startup = '\n\t\t' + startup.replace('%SCREENTYPES%', JSON.stringify(opts.screenTypes))
							.replace('%JSASSETS%', JSON.stringify(jsAssets)).replace(/[\n\r]+(.)/g, '\n\t\t$1')
							.replace(/[\n\r]+$/, '\n\t');
					htmlPluginData.head.unshift({
						tagName: 'script',
						closeTag: true,
						attributes: {
							type: 'text/javascript'
						},
						innerHTML: startup
					});
				}
				callback(null, htmlPluginData);
			});

			// Replace the contents of the root div with our prerendered result as necessary.
			compilation.plugin('html-webpack-plugin-after-html-processing', function(htmlPluginData, callback) {
				if(!status.err) {
					var html = replaceRootDiv(htmlPluginData.html, 0, htmlPluginData.html.length-6, '<div id="root">'
							+ status.prerender + '</div>');
					if(html) {
						htmlPluginData.html = html;
					} else {
						compilation.errors.push(new Error('PrerenderPlugin: Unable find root div element. Please '
								+ 'verify it exists within your HTML template.'));
					}
				}
				callback(null, htmlPluginData);
			});
		}
	});
};

module.exports = PrerenderPlugin;
