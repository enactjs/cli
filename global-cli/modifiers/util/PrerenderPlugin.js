var
	path = require('path'),
	fs = require('fs'),
	chalk = require('chalk'),
	requireFromString = require('require-from-string'),
	LocaleHtmlPlugin = require('./LocaleHtmlPlugin'),
	FileXHR = require('./FileXHR');

// RegExp for prerender cleaning in content shell mode
var iconRegExp = /class=["]([^"]* )*Icon__icon__/;
// Equivalent to /[ \S]/gu transpiled via regexpu to ES5. Can be swapped once NodeJS 6.x is new minimum requirement.
var spaceRegExp =  /(?:[\0-\x08\x0E-\x9F\xA1-\u167F\u1681-\u1FFF\u200B-\u2027\u202A-\u202E\u2030-\u205E\u2060-\u2FFF\u3001-\uD7FF\uE000-\uFEFE\uFF00-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/g;

require('console.mute');

// Determine if it's a NodeJS output filesystem or if it's a foreign/virtual one.
function isNodeOutputFS(compiler) {
	return (compiler.outputFileSystem
			&& compiler.outputFileSystem.constructor
			&& compiler.outputFileSystem.constructor.name
			&& compiler.outputFileSystem.constructor.name === 'NodeOutputFileSystem');
}

function PrerenderPlugin(options) {
	this.options = options || {};
	this.options.chunk = this.options.chunk || 'main.js';
}

PrerenderPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	var src;

	compiler.plugin('compilation', function(compilation) {
		if(isNodeOutputFS(compiler)) {
			// Get the chunk source before any optimizations for prerender usage
			compilation.plugin('chunk-asset', function(chunk, file, callback) {
				if(file === opts.chunk) {
					src = compilation.assets[opts.chunk].source();
				}
				callback && callback();
			});

			compilation.plugin('html-webpack-plugin-after-html-processing', function(params, callback) {
				var htmlTemplate = params.html;
				var appFile = path.join(compiler.context, compiler.options.output.path, opts.chunk);

				// Attempt to resolve 'react-dom/server' relative to the project itself with internal as fallback
				var ReactDOMServer;
				try {
					ReactDOMServer = require(path.join(compiler.context, 'node_modules', 'react-dom', 'server'));
				} catch(e) {
					ReactDOMServer = require('react-dom/server');
				}

				// Add fetch to the global variables
				if (!global.fetch) {
					global.fetch = require('node-fetch');
					global.Response = global.fetch.Response;
					global.Headers = global.fetch.Headers;
					global.Request = global.fetch.Request;
				}
				try {
					if(params.plugin.options.externalFramework) {
						// Add external Enact framework filepath if it's used
						src = src.replace(/require\(["']enact_framework["']\)/g, 'require("' + params.plugin.options.externalFramework +  '")');

						// Ensure locale switching  support is loaded globally with external framework usage
						var framework = require(params.plugin.options.externalFramework);
						global.iLibLocale = framework('@enact/i18n/src/locale');
					}

					if(opts.locales) {
						// No prerendering is done in fallback root index.html
						compiler.apply(new LocaleHtmlPlugin({
							locales: opts.locales,
							template: htmlTemplate,
							server: ReactDOMServer,
							code: src
						}));
					} else {
						console.mute();
						var App = requireFromString(src, opts.chunk);
						var code = ReactDOMServer.renderToString(App['default'] || App);
						params.html = htmlTemplate.replace('<div id="root"></div>', '<div id="root">' + code + '</div>' + htmlAppend);
						console.resume();
					}
				} catch(e) {
					console.log();
					console.log(chalk.yellow('Unable to generate prerender of app state HTML'));
					console.log('Reason: ' + e.message || e);
					if(e.stack) {
						console.log(e.stack);
					}
					console.log();
					console.log('Continuing build without prerendering...');
				}
				callback && callback();
			});
		}
	});
};

module.exports = PrerenderPlugin;
