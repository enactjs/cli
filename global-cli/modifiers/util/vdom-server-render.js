/*
 *  vdom-server-render.js
 *
 *  Uses a domserver component like react-dom/server to render the HTML string
 *  for a given javascript virtualdom Enact codebase.
 */

const path = require('path'),
	fs = require('fs'),
	nodeFetch = require('node-fetch'),
	findCacheDir = require('find-cache-dir'),
	requireUncached = require('import-fresh'),
	FileXHR = require('./FileXHR');

require('console.mute');

global.fetch = nodeFetch;
global.Response = nodeFetch.Response;
global.Headers = nodeFetch.Headers;
global.Request = nodeFetch.Request;

const prerenderCache = path.join(findCacheDir({
	name: 'enact-dev',
	create: true
}), 'prerender');
let chunkTarget;

if(!fs.existsSync(prerenderCache)) fs.mkdirSync(prerenderCache);

module.exports = {
	/*
		Stages a target chunk of sourcecode to a temporary directory to be prerendered.
		Parameters:
			code 				Target chunk's sourcecode string
			opts:
				chunk 			Chunk filename; used to visually note within thrown errors
				externals		Filepath to external Enact framework to use with rendering
	*/
	stage: function(code, opts) {
		code = code.replace('return __webpack_require__(0);', '__webpack_require__.e = function() {};\nreturn __webpack_require__(0);');

		if(opts.externals) {
			// Add external Enact framework filepath if it's used.
			code = code.replace(/require\(["']enact_framework["']\)/g, 'require("'
					+ path.resolve(path.join(opts.externals, 'enact.js')) +  '")');
		}
		chunkTarget = path.join(prerenderCache, opts.chunk);
		fs.writeFileSync(chunkTarget, code, {encoding:'utf8'})
	},

	/*
		Renders the staged chunk with desired options used.
		Parameters:
			opts:
				server			ReactDomServer or server with compatible APIs
				locale 			Specific locale to use in rendering
				externals		Filepath to external Enact framework to use with rendering
		Returns:
			HTML static rendered string of the app's initial state.
	*/
	render: function(opts) {
		if(!chunkTarget) throw new Error('Source code not staged, unable render vdom into HTML string.');
		let rendered;

		if(opts.locale) {
			global.XMLHttpRequest = FileXHR;
		} else {
			delete global.XMLHttpRequest;
		}

		try {
			console.mute();

			if(opts.externals) {
				// Ensure locale switching  support is loaded globally with external framework usage.
				const framework = require(path.resolve(path.join(opts.externals, 'enact.js')));
				global.iLibLocale = framework('@enact/i18n/locale');
			} else {
				delete global.iLibLocale
			}

			const chunk = requireUncached(path.resolve(chunkTarget));

			// Update locale if needed.
			if(opts.locale && global.iLibLocale && global.iLibLocale.updateLocale) {
				console.resume();
				global.iLibLocale.updateLocale(opts.locale);
				console.mute();
			}

			rendered = opts.server.renderToString(chunk['default'] || chunk);

			// If --expose-gc is used in NodeJS, force garbage collect after prerender for minimal memory usage.
			if(global.gc) global.gc();

			console.resume();
		} catch(e) {
			console.resume();
			throw e;
		}
		return rendered;
	},

	/*
		Deletes any staged sourcecode cunks
	*/
	unstage: function() {
		if(chunkTarget && fs.existsSync(chunkTarget)) fs.unlinkSync(chunkTarget);
	}
};
