const fs = require('fs');
const path = require('path');
const {optionParser: app, configHelper: helper} = require('@enact/dev-utils');
const {usesCustomSkinTemplate} = require('./generate-html');
const {getIlibDefines} = require('./ilib-meta');

function loadProjectEnv (context, production) {
	process.chdir(context);
	process.env.NODE_ENV = production ? 'production' : 'development';
	require('../dotenv').load(context);
	app.setEnactTargetsAsDefault();
}

function getMainEntry (context, entryOverride, isomorphic) {
	if (entryOverride) {
		return path.resolve(context, entryOverride);
	}
	if (isomorphic && typeof app.isomorphic === 'string') {
		return path.resolve(context, app.isomorphic);
	}
	if (app.entry) {
		return path.resolve(context, app.entry);
	}
	const pkg = JSON.parse(fs.readFileSync(path.join(context, 'package.json'), {encoding: 'utf8'}));
	return path.resolve(context, pkg.main || 'src/index.js');
}

function getPublicPath (development) {
	const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
	return getPublicUrlOrPath(development, app.publicUrl, process.env.PUBLIC_URL).replace(/^\/$/, '');
}

function getCacheDir (context) {
	return path.join(context, 'node_modules', '.cache', 'enact-bun');
}

function ensureEntryFile (context, mainEntry, options = {}) {
	const {isomorphic, snapshot, fastRefresh} = options;
	const cacheDir = getCacheDir(context);
	fs.mkdirSync(cacheDir, {recursive: true});
	const polyfills = path.join(__dirname, '..', 'polyfills.js').replace(/\\/g, '/');
	const main = mainEntry.replace(/\\/g, '/');
	const entryPath = path.join(cacheDir, isomorphic ? 'entry-isomorphic.js' : 'entry.js');
	const lines = [];

	if (fastRefresh) {
		lines.push(
			"if (typeof window !== 'undefined') {",
			"\tvar refreshRuntime = require('react-refresh/runtime');",
			'\trefreshRuntime.injectIntoGlobalHook(window);',
			'\twindow.$RefreshReg$ = function () {};',
			'\twindow.$RefreshSig$ = function () { return function (type) { return type; }; };',
			'}'
		);
	}

	if (snapshot && isomorphic) {
		const {resolveSnapshotHelper} = require('./plugins/snapshot-enact');
		lines.push(
			`require(${JSON.stringify(resolveSnapshotHelper('snapshot-redux-helper'))});`,
			`require(${JSON.stringify(resolveSnapshotHelper('snapshot-helper'))});`
		);
	}

	lines.push(`require(${JSON.stringify(polyfills)});`);

	if (isomorphic) {
		lines.push(
			`var __enactApp = require(${JSON.stringify(main)});`,
			`module.exports = __enactApp && __enactApp.__esModule ? __enactApp.default : __enactApp;`
		);
	} else {
		lines.push(`module.exports = require(${JSON.stringify(main)});`);
	}

	fs.writeFileSync(entryPath, lines.join('\n'), {encoding: 'utf8'});
	return entryPath;
}

function getResolveAliases (context) {
	const aliases = {
		'react-is': path.dirname(require.resolve('react-is/package.json'))
	};
	if (fs.existsSync(path.join(context, 'node_modules', '@enact', 'i18n', 'ilib'))) {
		aliases.ilib = '@enact/i18n/ilib';
	} else {
		aliases['@enact/i18n/ilib'] = 'ilib';
	}
	if (app.alias) {
		Object.assign(aliases, app.alias);
	}
	return aliases;
}

function getDefines (opts = {}) {
	const defines = {
		'process.env.NODE_ENV': JSON.stringify(opts.production ? 'production' : 'development'),
		'process.env.PUBLIC_URL': JSON.stringify(opts.publicPath || '/'),
		ENACT_PACK_ISOMORPHIC: JSON.stringify(!!opts.isomorphic),
		ENACT_PACK_NO_ANIMATION: JSON.stringify(!!opts.noAnimation)
	};
	Object.keys(process.env)
		.filter(key => /^(REACT_APP|WDS_SOCKET)/.test(key))
		.forEach(key => {
			defines[`process.env.${key}`] = JSON.stringify(process.env[key]);
		});

	const ilibDefines = getIlibDefines(opts.context || app.context, opts.publicPath || '/', {
		ilibAdditionalResourcesPath: opts.ilibAdditionalResourcesPath
	});
	for (const [key, value] of Object.entries(ilibDefines)) {
		defines[key] = value;
	}

	return defines;
}

function createBuildOptions (opts = {}) {
	const context = opts.context || app.context;
	loadProjectEnv(context, opts.production);

	if (opts.snapshot) {
		opts.isomorphic = true;
	}

	const mainEntry = getMainEntry(context, opts.entry, opts.isomorphic);
	const useSnapshot = !!(opts.snapshot && !opts.externals);
	const entryFile = ensureEntryFile(context, mainEntry, {
		isomorphic: opts.isomorphic,
		snapshot: useSnapshot,
		fastRefresh: !!opts.fastRefresh
	});
	const development = !opts.production;
	const publicPath = getPublicPath(development);
	const outputPath = path.resolve(opts.output || path.join(context, 'dist'));
	const useTailwind = fs.existsSync(path.join(context, 'tailwind.config.js'));
	const defines = getDefines({
		...opts,
		publicPath,
		context,
		ilibAdditionalResourcesPath: opts.ilibAdditionalResourcesPath
	});
	const externalsPath = opts.externals || null;
	const externalsPublic = opts['externals-public'] || opts.externalsPublic || null;
	const template = app.template || path.join(__dirname, '..', 'html-template.ejs');
	const customSkin = !!(opts.customSkin || usesCustomSkinTemplate(template));

	if (externalsPath && !process.env.ILIB_BASE_PATH) {
		const {getFrameworkPublicPath} = require('./externals');
		const frameworkPublicPath = getFrameworkPublicPath(externalsPath, externalsPublic);
		if (frameworkPublicPath) {
			const ilibInEnact = path.join(frameworkPublicPath, 'node_modules', '@enact', 'i18n', 'ilib');
			const ilibStandalone = path.join(frameworkPublicPath, 'node_modules', 'ilib');
			process.env.ILIB_BASE_PATH = fs.existsSync(path.join(context, 'node_modules', '@enact', 'i18n', 'ilib'))
				? ilibInEnact.replace(/\\/g, '/')
				: ilibStandalone.replace(/\\/g, '/');
		}
	}

	return {
		context,
		mainEntry,
		entryFile,
		development,
		publicPath,
		outputPath,
		useTailwind,
		defines,
		minify: opts.minify !== false && opts.production,
		sourcemap: (process.env.GENERATE_SOURCEMAP || (opts.production ? 'false' : 'true')) !== 'false',
		aliases: getResolveAliases(context),
		isomorphic: !!opts.isomorphic,
		snapshot: useSnapshot,
		noAnimation: !!opts.noAnimation,
		contentHash: !!opts.contentHash,
		splitCss: opts.splitCss !== false,
		linting: opts.linting !== false,
		externalsPath,
		externalsPublic,
		externalsPolyfill: !!(opts.externalsPolyfill || opts['externals-corejs']),
		ilibAdditionalResourcesPath: opts.ilibAdditionalResourcesPath,
		forceCSSModules: !!app.forceCSSModules,
		accent: app.accent,
		ri: app.ri,
		title: app.title || app.name || '',
		template,
		customSkin
	};
}

module.exports = {
	loadProjectEnv,
	getMainEntry,
	getPublicPath,
	getCacheDir,
	ensureEntryFile,
	getResolveAliases,
	getDefines,
	createBuildOptions,
	helper
};
