const
	path = require('path'),
	fs = require('fs-extra'),
	chalk = require('chalk'),
	exists = require('path-exists').sync,
	snapshotSetup = require('./snapshot'),
	helper = require('./util/config-helper'),
	PrerenderPlugin = require('./util/PrerenderPlugin'),
	LocaleHtmlPlugin = require('./util/LocaleHtmlPlugin');

const screenTypes = {
	'moonstone': path.join('node_modules', '@enact', 'moonstone', 'MoonstoneDecorator', 'screenTypes.json'),
	'zircon': path.join('node_modules', '@enact', 'zircon', 'ZirconDecorator', 'screenTypes.json')
};

function readJSON(file) {
	try {
		return JSON.parse(fs.readFileSync(file, {encoding:'utf8'}));
	} catch(e) {
		return undefined;
	}
}

module.exports = function(config, opts) {
	const meta = readJSON('./package.json') || {};
	const enact = meta.enact || {};
	const iso = enact.isomorphic || enact.prerender;

	// Only use isomorphic if an isomorphic entrypoint is specified.
	if(iso) {
		// Resolve ReactDOMSever relative to the app, with enact-dev's copy as fallback.
		let reactDOMServer = path.join(process.cwd(), 'node_modules', 'react-dom', 'server.js');
		if(!exists(reactDOMServer)) {
			reactDOMServer = require.resolve('react-dom/server');
		}

		if(!opts.externals) {
			// Expose iLib locale utility function module so we can update the locale on page load, if used.
			if(opts.locales) {
				const locale = path.join(process.cwd(), 'node_modules', '@enact', 'i18n', 'locale', 'locale.js');
				if(exists(locale)) {
					const babel = helper.findLoader(config, 'babel');
					config.module.rules.splice((babel>=0 ? babel : 0), 0, {
						test: fs.realpathSync(locale),
						loader: 'expose-loader',
						options: 'iLibLocale'
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
		const prerenderOpts = {
			server: require(reactDOMServer),
			locales: opts.locales,
			externals: opts.externals,
			screenTypes:
					(typeof enact.screenTypes === 'object' ? enact.screenTypes : null)
					|| readJSON(screenTypes[(enact.screenTypes || 'moonstone').replace(/^@enact\//, '')])
					|| readJSON(path.join(enact.screenTypes))
					|| readJSON(path.join('node_modules', enact.screenTypes))
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
