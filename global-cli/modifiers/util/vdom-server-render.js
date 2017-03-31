/*
 *  vdom-server-render.js
 *
 *  Uses a domserver component like react-dom/server to render the HTML string
 *  for a given javascript virtualdom Enact codebase.
 */

var path = require('path'),
	nodeFetch = require('node-fetch'),
	vm = require('vm'),
	FileXHR = require('./FileXHR');

require('console.mute');

// Setup a generic shared context to run App code within
var m = {
	exports:{}
};
var sandbox = Object.assign({
	require: require,
	module: m,
	exports: m.exports,
	__dirname: process.cwd(),
	__filename: 'main.js',
	fetch: nodeFetch,
	Response: nodeFetch.Response,
	Headers: nodeFetch.Headers,
	Request: nodeFetch.Request
}, global);
var context = vm.createContext(sandbox);

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

	if(opts.locale) {
		sandbox.XMLHttpRequest = FileXHR;
	} else {
		delete sandbox.XMLHttpRequest;
	}

	try {
		console.mute();

		if(opts.externals) {
			opts.externals = path.resolve(path.join(opts.externals, 'enact.js'));
			// Add external Enact framework filepath if it's used.
			opts.code = opts.code.replace(/require\(["']enact_framework["']\)/g, 'require("' + opts.externals +  '")');
			// Ensure locale switching  support is loaded globally with external framework usage.
			var framework = require(opts.externals);
			sandbox.iLibLocale = framework('@enact/i18n/locale');
		} else {
			delete sandbox.iLibLocale
		}

		m.exports = {};
		vm.runInContext(opts.code, context, {
			filename: opts.file,
			displayErrors: true
		});

		// Update locale if needed.
		if(opts.locale && sandbox.iLibLocale && sandbox.iLibLocale.updateLocale) {
			sandbox.iLibLocale.updateLocale(opts.locale);
		}

		rendered = opts.server.renderToString(m.exports['default'] || m.exports);

		console.resume();
	} catch(e) {
		console.resume();
		throw e;
	}
	return rendered;
};
