var
	path = require('path'),
	fs = require('fs');

function exists(item) {
	try {
		return !!(fs.statSync(item));
	} catch(e) {
		return false;
	}
}

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
				var prerenderFile = path.join(compiler.context, compiler.options.output.path, 'prerender.js');
				var tries = 0;
				var id = setInterval(function() {
					tries++;
					if(tries>100) {
						// the entire build should bail on errors, so we are
						// only waiting on processing/fs operations.
						// 5sec timeout
						clearInterval(id);
						console.error('WARNING: PrerenderPlugin timed out.');
						fs.unlinkSync(prerenderFile);
						callback && callback();
					} else {
						if(exists(prerenderFile)) {
							clearInterval(id);
							try {
								var iso = require(prerenderFile);
								var code = iso();
								params.html = params.html.replace('<div id="root"></div>', '<div id="root">' + code + '</div>');
								fs.unlinkSync(prerenderFile);
							} catch(e) {
								console.error('ERROR: Unable to generate prerender of app state html.');
								console.error(e);
								fs.unlinkSync(prerenderFile);
								process.exit(1);
							}
							callback && callback();
						}
					}
				}, 50);
			});
		}
	});
};
