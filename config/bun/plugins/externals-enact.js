const fs = require('fs');
const path = require('path');
const app = require('@enact/dev-utils/option-parser');

const DEFAULT_LIBRARIES = [
	'@enact',
	'react',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'ilib'
];

const DEFAULT_IGNORE = [
	'@enact/dev-utils',
	'@enact/storybook-utils',
	'@enact/ui-test-utils',
	'@enact/screenshot-test-utils',
	'readable-stream',
	'react-is'
];

function escapeRegExp (value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findParentMain (dir) {
	const currPkg = path.join(dir, 'package.json');
	if (fs.existsSync(currPkg)) {
		const meta = JSON.parse(fs.readFileSync(currPkg, {encoding: 'utf8'}));
		if (meta.main) {
			return {path: dir, pointsTo: path.join(dir, meta.main).replace(/\.js$/, '')};
		}
	}
	if (dir === path.parse(dir).root || dir === '.' || dir === '') {
		return null;
	}
	return findParentMain(path.dirname(dir));
}

function normalizeLocalId (resource, context) {
	const parent = findParentMain(path.dirname(resource));
	let localResource = resource;
	if (parent && parent.pointsTo === resource) {
		localResource = parent.path;
	}
	return localResource
		.replace(context, app.name)
		.replace(/\.js$/, '')
		.replace(/\\/g, '/')
		.replace(app.name + '/node_modules/', '')
		.replace(/[\\/]$/, '');
}

function shouldExternalizeLocal (resource, context, ignoreReg) {
	if (!resource.startsWith(context)) return false;
	if (/[\\/]tests[\\/]/.test('./' + path.relative(context, resource))) return false;
	const relative = resource.replace(/^(.*[\\/]node_modules[\\/])+/, '');
	if (ignoreReg && ignoreReg.test(relative)) return false;
	return true;
}

function createExternalsEnactPlugin (options = {}) {
	const libraries = options.libraries || DEFAULT_LIBRARIES;
	const ignore = options.ignore || DEFAULT_IGNORE;
	const polyfillPath = options.polyfill || null;
	const context = options.context || app.context;
	const enableLocal = !!options.local;
	const libReg = new RegExp('^(' + libraries.map(escapeRegExp).join('|') + ')(?=/|$)');
	const ignReg = new RegExp('^(' + ignore.map(p => escapeRegExp(p)).join('|') + ')(?=/|$)');

	return {
		name: 'enact-externals',
		setup (build) {
			if (polyfillPath) {
				const resolvedPolyfill = path.resolve(polyfillPath);
				build.onResolve({filter: /.*/}, args => {
					const resolved = path.isAbsolute(args.path)
						? args.path
						: path.resolve(args.resolveDir, args.path);
					if (resolved === resolvedPolyfill) {
						return {
							path: '@enact/polyfills',
							namespace: 'enact-external'
						};
					}
					return undefined;
				});
			}

			if (enableLocal) {
				build.onResolve({filter: /^\./}, args => {
					const resource = path.resolve(args.resolveDir, args.path);
					if (!shouldExternalizeLocal(resource, context, ignReg)) {
						return undefined;
					}
					return {
						path: normalizeLocalId(resource, context),
						namespace: 'enact-external'
					};
				});
			}

			build.onResolve({filter: libReg}, args => {
				if (ignReg.test(args.path)) {
					return undefined;
				}
				return {
					path: args.path,
					namespace: 'enact-external'
				};
			});

			build.onLoad({filter: /.*/, namespace: 'enact-external'}, args => {
				const id = args.path;
				const contents = [
					"const fw = typeof enact_framework !== 'undefined' ? enact_framework : globalThis.enact_framework;",
					'const req = typeof fw === \'function\' ? fw : fw && fw.require;',
					'if (!req) {',
					"\tthrow new Error('External Enact framework not loaded. Include enact.js before the app bundle.');",
					'}',
					'const mod = req(' + JSON.stringify(String(id)) + ');',
					// Pure named-export modules (e.g. @enact/core/util) have __esModule
					// set but no default — falling back to mod itself is required, or the
					// named-export copy below writes onto undefined and throws.
					"const resolved = mod && mod.__esModule && mod.default !== undefined ? mod.default : mod;",
					'module.exports = resolved;',
					"if (mod && typeof mod === 'object' && resolved && (typeof resolved === 'object' || typeof resolved === 'function')) {",
					'\tfor (const key of Object.keys(mod)) {',
					"\t\tif (key !== 'default' && !(key in resolved)) resolved[key] = mod[key];",
					'\t}',
					'}'
				].join('\n');
				return {loader: 'js', contents};
			});
		}
	};
}

function shouldEnableLocalExternals (context) {
	const pkgRoot = require('@enact/dev-utils/package-root');
	process.chdir(context);
	const pkg = pkgRoot();
	return (
		pkg.meta.name.startsWith('@enact/') &&
		(fs.existsSync(path.join(pkg.path, 'MoonstoneDecorator')) ||
			fs.existsSync(path.join(pkg.path, 'ThemeDecorator')) ||
			pkg.meta.name === '@enact/i18n')
	);
}

module.exports = {
	createExternalsEnactPlugin,
	shouldEnableLocalExternals,
	DEFAULT_LIBRARIES,
	DEFAULT_IGNORE
};
