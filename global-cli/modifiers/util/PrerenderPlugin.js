var
	path = require('path'),
	fs = require('fs'),
	chalk = require('chalk'),
	requireFromString = require('require-from-string'),
	LocaleHtmlPlugin = require('./LocaleHtmlPlugin'),
	FileXHR = require('./FileXHR');

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
}

PrerenderPlugin.prototype.apply = function(compiler) {
	var opts = this.options;
	compiler.plugin('compilation', function(compilation) {
		if(isNodeOutputFS(compiler)) {
			compilation.plugin('html-webpack-plugin-after-html-processing', function(params, callback) {
				var htmlTemplate = params.html;
				var appFile = path.join(compiler.context, compiler.options.output.path, 'main.js');

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
					var src = compilation.assets['main.js'].source();
					if(params.plugin.options.externalFramework) {
						// Add external Enact framework filepath if it's used
						src = src.replace(/require\(["']enact_framework["']\)/g, 'require("' + params.plugin.options.externalFramework +  '")');

						// Ensure locale switching  support is loaded globally with external framework usage
						var framework = require(params.plugin.options.externalFramework);
						global.iLibLocale = framework('@enact/i18n/src/locale');
					}
					console.mute();
					var App = requireFromString(src, 'main.js');
					var code = ReactDOMServer.renderToString(App['default'] || App);
					console.resume();
					params.html = htmlTemplate.replace('<div id="root"></div>', '<div id="root">' + code + '</div>');

					if(opts.locales) {
						compiler.apply(new LocaleHtmlPlugin({
							locales: opts.locales,
							template: htmlTemplate,
							server: ReactDOMServer,
							code: src
						}));
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
