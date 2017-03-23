/*
 *  vdom-server-render.js
 *
 *  Uses a domserver component like react-dom/server to render the HTML string
 *  for a given javascript virtualdom Enact codebase.
 */

var FileXHR = require('./FileXHR'),
	nodeFetch = require('node-fetch'),
	requireFromString = require('require-from-string');

require('console.mute');

/*
	Options:
		server			ReactDomServer or server with compatible APIs
		code			Javascript sourcecode string
		file 			Filename to designate the code from in NodeJS (visually noted within thrown errors)
		locale 			Specific locale to use in rendering
		externals		filepath to external Enact framework to use with rendering
*/
module.exports = function(opts) {
	var rendered;

	// Add fetch to the global variables
	if (!global.fetch) {
		global.fetch = nodeFetch;
		global.Response = global.fetch.Response;
		global.Headers = global.fetch.Headers;
		global.Request = global.fetch.Request;
	}

	if(opts.locale) {
		global.XMLHttpRequest = FileXHR;
	} else {
		delete global.XMLHttpRequest;
	}

	try {
		console.mute();

		if(opts.externals) {
			opts.externals = path.resolve(path.join(opts.externals, 'enact.js'));
			// Add external Enact framework filepath if it's used.
			opts.code = opts.code.replace(/require\(["']enact_framework["']\)/g, 'require("' + opts.externals +  '")');
			// Ensure locale switching  support is loaded globally with external framework usage.
			var framework = require(opts.externals);
			global.iLibLocale = framework('@enact/i18n/locale');
		}

		var App = requireFromString(opts.code, opts.file);

		// Update locale if needed.
		if(opts.locale && global.iLibLocale && global.iLibLocale.updateLocale) {
			global.iLibLocale.updateLocale(opts.locale);
		}

		rendered = opts.server.renderToString(App['default'] || App);
		console.resume();
	} catch(e) {
		console.resume();
		throw e;
	}
	return rendered;
};
