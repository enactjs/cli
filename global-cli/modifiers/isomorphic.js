var
	path = require('path'),
	fs = require('fs-extra'),
	chalk = require('chalk'),
	exists = require('path-exists').sync,
	snapshotSetup = require('./snapshot'),
	helper = require('./util/config-helper'),
	PrerenderPlugin = require('./util/PrerenderPlugin'),
	LocaleHtmlPlugin = require('./util/LocaleHtmlPlugin');

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return undefined;
	}
}

module.exports = function(config, opts) {
	var meta = readJSON('package.json') || {};
	var enact = meta.enact || {};
	var iso = enact.isomorphic || enact.prerender;

	// Only use isomorphic if an isomorphic entrypoint is specified.
	if(iso) {
		// Resolve ReactDOM and ReactDOMSever relative to the app, with enact-dev's copy as fallback.
		var reactDOM = path.join(process.cwd(), 'node_modules', 'react-dom', 'index.js');
		var reactDOMServer = path.join(process.cwd(), 'node_modules', 'react-dom', 'server.js');
		if(!exists(reactDOM)) {
			reactDOM = require.resolve('react-dom');
			reactDOMServer = require.resolve('react-dom/server');
		}

		if(!opts.externals) {
			// Prepend react-dom as top level entrypoint so espose-loader will expose
			// it to window.ReactDOM to allow runtime rendering of the app.
			config.entry.main.splice(-1, 0, reactDOM);

			// Expose the 'react-dom' on a global context for App's rendering
			// Currently maps the toolset to window.ReactDOM.
			config.module.loaders.push({
				test: reactDOM,
				loader: 'expose?ReactDOM'
			});

			// Expose iLib locale utility function module so we can update the locale on page load, if used.
			if(opts.locales) {
				var locale = path.join(process.cwd(), 'node_modules', '@enact', 'i18n', 'locale', 'locale.js');
				if(exists(locale)) {
					var babel = helper.findLoader(config, 'babel');
					config.module.loaders.splice((babel>=0 ? babel : 0), 0, {
						test: fs.realpathSync(locale),
						loader: 'expose?iLibLocale'
					});
				}
			}
		}

		// If 'isomorphic' value is a string, use custom entrypoint.
		if(typeof iso === 'string') {
			config.entry.main[config.entry.main.length-1] = path.resolve(iso);
		}

		// Since we're building for isomorphic usage, expose ReactElement
		config.output.library = 'App';

		// Use universal module definition to allow usage in Node and browser environments.
		config.output.libraryTarget = 'umd';

		// Include plugin to prerender the html into the index.html
		var prerenderOpts = {
			server: require(reactDOMServer),
			locales: opts.locales,
			externals: opts.externals,
			screenTypes: enact.screenTypes
					|| readJSON('./node_modules/@enact/moonstone/MoonstoneDecorator/screenTypes.json')
		}
		if(!opts.locales) {
			config.plugins.push(new PrerenderPlugin(prerenderOpts));
		} else {
			config.plugins.push(new LocaleHtmlPlugin(prerenderOpts));
		}

		// Apply snapshot specialization options if needed
		if(opts.snapshot && !opts.externals) {
			snapshotSetup(config, opts);
		}
	} else {
		console.log(chalk.yellow('Isomorphic entrypoint not found in package.json; building normally'));
	}
};
