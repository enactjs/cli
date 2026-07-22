const fs = require('fs');
const path = require('path');

const fastGlob = require(require.resolve('fast-glob', {
	paths: [path.dirname(require.resolve('@enact/dev-utils/package.json'))]
}));
const packageRoot = require('@enact/dev-utils/package-root');
const {shouldExcludePath} = require('./plugins/framework-exclusions');

const ROOT_PACKAGES = [
	'react',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
	'react/jsx-runtime',
	'react/jsx-dev-runtime'
];

const FRAMEWORK_IGNORE = [
	'**/webpack.config.js',
	'**/eslint.config.js',
	'**/karma.conf.js',
	'**/build/**/*.*',
	'**/dist/**/*.*',
	'**/@enact/dev-utils/**/*.*',
	'**/@enact/docs-utils/**/*.*',
	'**/@enact/storybook-utils/**/*.*',
	'**/@enact/ui-test-utils/**/*.*',
	'**/@enact/screenshot-test-utils/**/*.*',
	'**/ilib/localedata/**/*.*',
	'**/node_modules/**/*.*',
	'**/samples/**/*.*',
	'**/tests/**/*.*',
	'**/ilib-node*.js',
	'**/AsyncNodeLoader.js',
	'**/NodeLoader.js',
	'**/RhinoLoader.js',
	'**/react-dom/cjs/react-dom-server.node.*'
];

const ILIB_IGNORE = [
	'!node_modules',
	'!locale',
	'**/ilib-node*.js',
	'**/AsyncNodeLoader.js',
	'**/NodeLoader.js',
	'**/RhinoLoader.js'
];

function isFrameworkModuleFile (file) {
	return !/(^|[/\\])test[/\\]|\.test\.(js|jsx|es6)$|[-.]specs?\.(js|jsx|es6)$|\.bak(?:\.|\/|\\)/.test(file);
}

function getModuleId (nodeModules, file) {
	const absPath = path.join(nodeModules, file);
	let dir = absPath;

	while (dir.startsWith(nodeModules) && dir.length > nodeModules.length) {
		const pkgPath = path.join(dir, 'package.json');
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, {encoding: 'utf8'}));
				if (pkg.main) {
					const mainPath = path.resolve(dir, pkg.main);
					if (path.resolve(absPath) === mainPath) {
						return path.relative(nodeModules, dir).replace(/\\/g, '/');
					}
				}
			} catch (_e) {
				// ignore invalid package.json
			}
			if (/[/\\]index\.(js|jsx|es6)$/.test(absPath)) {
				return path.relative(nodeModules, dir).replace(/\\/g, '/');
			}
		}
		dir = path.dirname(dir);
	}

	let id = file.replace(/\.(jsx|es6|js)$/, '').replace(/\\/g, '/');
	if (id.endsWith('/index') && id.length > 6) {
		id = id.slice(0, -6);
	}
	return id;
}

function getPolyfillModules (context, polyfillPath) {
	if (!polyfillPath) return [];
	const modules = [{id: '@enact/polyfills', request: polyfillPath}];
	return modules;
}

function getCoreJsModules () {
	try {
		const coreJsRoot = path.dirname(require.resolve('core-js/package.json'));
		return fastGlob.sync('modules/**/*.js', {cwd: coreJsRoot, absolute: true}).map(file => ({
			id: path.relative(coreJsRoot, file).replace(/\\/g, '/').replace(/\.js$/, ''),
			request: file
		}));
	} catch (_e) {
		return [];
	}
}

function getThemeLocalModules (context) {
	process.chdir(context);
	const app = packageRoot();
	if (
		!app.meta.name.startsWith('@enact/') ||
		!(
			fs.existsSync(path.join(app.path, 'MoonstoneDecorator')) ||
			fs.existsSync(path.join(app.path, 'ThemeDecorator')) ||
			app.meta.name === '@enact/i18n'
		)
	) {
		return [];
	}

	return fastGlob
		.sync('**/*.@(js|jsx|es6)', {
			cwd: app.path,
			onlyFiles: true,
			ignore: [
				'!node_modules',
				'!samples',
				'!dist',
				'!build',
				'!resources',
				'!coverage',
				'!tests',
				'**/__tests__/**/*.{js,jsx,ts,tsx}',
				'**/?(*.)+(spec|test).[jt]s?(x)',
				'**/*-specs.{js,jsx,ts,tsx}',
				'**/*.bak*/**',
				'**/*bak*/**'
			]
		})
		.map(file => {
			const abs = path.resolve(app.path, file);
			let id = './' + file.replace(/\.(jsx|es6|js)$/, '').replace(/\\/g, '/');
			if (id.endsWith('/index') && id.length > 6) {
				id = id.slice(0, -6);
			}
			if (id.startsWith('.') && !id.startsWith('..')) {
				id = id.replace(/^\./, app.meta.name);
			}
			return {id, request: abs};
		});
}

function getFrameworkModuleRequests (context, options = {}) {
	const nodeModules = path.join(context, 'node_modules');
	const enactFiles = fastGlob.sync('@enact/**/*.@(js|jsx|es6)', {
		cwd: nodeModules,
		onlyFiles: true,
		ignore: FRAMEWORK_IGNORE,
		followSymbolicLinks: false
	});
	const ilibFiles = fastGlob.sync('ilib/**/*.@(js|jsx|es6)', {
		cwd: nodeModules,
		onlyFiles: true,
		ignore: ILIB_IGNORE,
		followSymbolicLinks: false
	});

	const modules = new Map();
	for (const pkg of ROOT_PACKAGES) {
		modules.set(pkg, pkg);
	}
	for (const file of enactFiles.concat(ilibFiles)) {
		if (!isFrameworkModuleFile(file)) continue;
		const id = getModuleId(nodeModules, file);
		if (!modules.has(id)) {
			modules.set(id, id);
		}
	}

	for (const {id, request} of getThemeLocalModules(context)) {
		modules.set(id, request);
	}

	if (options.polyfill) {
		for (const {id, request} of getPolyfillModules(context, options.polyfill)) {
			modules.set(id, request);
		}
	} else if (options.includeCoreJs) {
		for (const {id, request} of getCoreJsModules()) {
			modules.set(id, request);
		}
	}

	return [...modules.entries()].map(([id, request]) => ({id, request}));
}

function writeFrameworkEntry (context, modules, options = {}) {
	const cacheDir = path.join(context, 'node_modules', '.cache', 'enact-bun');
	fs.mkdirSync(cacheDir, {recursive: true});
	const entryPath = path.join(cacheDir, 'framework-entry.js');

	// Embed dynamic values only via JSON.stringify so generated JS cannot be injected.
	const jsLiteral = value => JSON.stringify(String(value));
	const registerRequire = (id, requestPath) =>
		'__register(' +
		jsLiteral(id) +
		', function () { return require(' +
		jsLiteral(requestPath) +
		'); });';
	const emitRequire = requestPath => 'require(' + jsLiteral(requestPath) + ');';

	const lines = [
		'var __registry = Object.create(null);',
		'function __register(id, loader) { __registry[id] = loader; }',
		''
	];

	if (options.polyfill) {
		const polyfillPath = path.resolve(options.polyfill).replace(/\\/g, '/');
		lines.push(registerRequire('@enact/polyfills', polyfillPath));
	}

	for (const {id, request} of modules) {
		const normalizedRequest = String(request).replace(/\\/g, '/');
		if (shouldExcludePath(normalizedRequest)) {
			continue;
		}
		lines.push(registerRequire(id, normalizedRequest));
	}

	lines.push('', '// Eagerly load framework modules for CSS extraction');
	for (const {request} of modules) {
		const normalizedRequest = String(request).replace(/\\/g, '/');
		if (shouldExcludePath(normalizedRequest)) {
			continue;
		}
		lines.push(emitRequire(normalizedRequest));
	}

	lines.push(
		'',
		'function enact_framework(id) {',
		'\tvar loader = __registry[id];',
		'\tif (!loader) throw new Error(\'Cannot find enact framework module \' + id);',
		'\treturn loader();',
		'}',
		'enact_framework.require = enact_framework;',
		'module.exports = enact_framework;',
		''
	);

	fs.writeFileSync(entryPath, lines.join('\n'), {encoding: 'utf8'});
	return entryPath;
}

function wrapFrameworkBundle (code) {
	const body = code.replace(/^\uFEFF?#![^\n]*\n/, '');
	return [
		'(function (root, factory) {',
		'\tif (typeof module === \'object\' && typeof module.exports !== \'undefined\') {',
		'\t\tmodule.exports = factory(root, typeof require === \'function\' ? require : null);',
		'\t} else {',
		'\t\troot.enact_framework = factory(root, null);',
		'\t}',
		'})(typeof self !== \'undefined\' ? self : this, function (root, nodeRequire) {',
		'\tvar exports = {};',
		'\tvar module = { exports: exports };',
		'\tvar require = nodeRequire || function () {',
		'\t\tthrow new Error(\'Enact framework requires a runtime require() implementation.\');',
		'\t};',
		'\t(function () {',
		body,
		'\t})();',
		'\tvar framework = module.exports;',
		'\tif (typeof framework === \'function\') {',
		'\t\tframework.require = framework.require || framework;',
		'\t}',
		'\treturn framework;',
		'});',
		''
	].join('\n');
}

async function applyFramework (options = {}) {
	const context = path.resolve(options.context || process.cwd());
	const output = path.resolve(options.output || path.join(context, 'dist'));
	const polyfillPath = options.polyfill
		? path.join(__dirname, '..', 'polyfills.js')
		: null;
	const modules = getFrameworkModuleRequests(context, {
		polyfill: polyfillPath,
		includeCoreJs: !!options.includeCoreJs && !polyfillPath
	});

	if (modules.length === 0) {
		throw new Error('Framework build: no @enact entries found.');
	}

	fs.mkdirSync(output, {recursive: true});
	const entryPath = writeFrameworkEntry(context, modules, {polyfill: polyfillPath});
	const plugins = options.plugins || [];
	const result = await Bun.build({
		entrypoints: [entryPath.replace(/\\/g, '/')],
		outdir: output,
		target: 'browser',
		format: 'cjs',
		naming: 'enact.[ext]',
		minify: !!options.production,
		sourcemap: options.production ? 'none' : 'linked',
		define: options.define || {global: 'globalThis'},
		plugins
	});

	if (!result.success) {
		for (const log of result.logs) console.error(log);
		throw new Error('Framework build failed.');
	}

	const jsOutput = result.outputs.find(outputFile => outputFile.path.endsWith('.js'));
	const cssOutput = result.outputs.find(outputFile => outputFile.path.endsWith('.css'));
	if (jsOutput) {
		const code = fs.readFileSync(jsOutput.path, {encoding: 'utf8'});
		fs.writeFileSync(jsOutput.path, wrapFrameworkBundle(code), {encoding: 'utf8'});
	}
	if (cssOutput && path.basename(cssOutput.path) !== 'enact.css') {
		const enactCss = path.join(output, 'enact.css');
		fs.copyFileSync(cssOutput.path, enactCss);
		if (cssOutput.path !== enactCss) {
			fs.unlinkSync(cssOutput.path);
		}
	}

	if (options.snapshot) {
		require('./snapshot.js').applySnapshot({
			output,
			target: 'enact.js'
		});
	}

	return output;
}

module.exports = {
	applyFramework,
	getFrameworkModuleRequests,
	getModuleId,
	wrapFrameworkBundle
};
