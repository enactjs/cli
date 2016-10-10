var
	path = require('path'),
	fs = require('fs'),
	requireFromString = require('require-from-string');

function PrerenderPlugin(options) {
	this.options = options || {};
}
module.exports = PrerenderPlugin;
PrerenderPlugin.prototype.apply = function(compiler) {
	var NodeOutputFileSystem = null;
	try {
		NodeOutputFileSystem = require('webpack/lib/node/NodeOutputFileSystem');
	} catch(e) {
		console.error('PrerenderPlugin loader is not compatible with standalone global installs of Webpack.');
		return;
	}
	compiler.plugin('compilation', function(compilation) {
		if(compiler.outputFileSystem.writeFile===NodeOutputFileSystem.prototype.writeFile) {
			compilation.plugin('html-webpack-plugin-after-html-processing', function(params, callback) {
				var appFile = path.join(compiler.context, compiler.options.output.path, 'main.js');
				var ReactDOMServer;
				try {
					ReactDOMServer = require(path.join(compiler.context, 'node_modules', 'react-dom', 'server'));
				} catch(e) {
					ReactDOMServer = require('react-dom/server');
				}
				try {
					var App = requireFromString(compilation.assets['main.js'].source(), 'main.js');
					var code = ReactDOMServer.renderToString(App['default'] || App);
					params.html = params.html.replace('<div id="root"></div>', '<div id="root">' + code + '</div>');
				} catch(e) {
					console.error('ERROR: Unable to generate prerender of app state html.');
					console.error(e);
					process.exit(1);
				}
				callback && callback();
			});
		}
	});
};
