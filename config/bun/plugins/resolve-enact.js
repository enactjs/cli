const path = require('path');
const fs = require('fs');
const {resolveAppRootImport} = require('./resolve-tilde-import');

function normalizeBundlerPath (filePath) {
	return filePath.replace(/\\/g, '/');
}

function normalizeAdditionalModulePaths (paths, context) {
	if (!paths) return [];
	const list = Array.isArray(paths) ? paths : [paths];
	return list.map(modulePath => path.resolve(context, modulePath));
}

function resolveFromModulePaths (request, modulePaths) {
	for (const modulePath of modulePaths) {
		const resolved = path.join(modulePath, request);
		if (fs.existsSync(resolved)) {
			return resolved;
		}
	}
	return null;
}

function createResolveEnactPlugin (options = {}) {
	const context = options.context || process.cwd();
	const aliases = options.aliases || {};
	const additionalModulePaths = normalizeAdditionalModulePaths(options.additionalModulePaths, context);

	return {
		name: 'enact-resolve',
		setup (build) {
			build.onResolve({filter: /.*/}, args => {
				const appRootPath = resolveAppRootImport(args.path, context);
				if (appRootPath) {
					return {path: normalizeBundlerPath(appRootPath)};
				}

				if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) {
					const fromModulePaths = resolveFromModulePaths(args.path, additionalModulePaths);
					if (fromModulePaths) {
						return {path: normalizeBundlerPath(fromModulePaths)};
					}
				}

				for (const [key, target] of Object.entries(aliases)) {
					if (args.path === key) {
						let resolved = target;
						if (!path.isAbsolute(target) && !target.startsWith('@')) {
							resolved = path.join(context, target);
						} else {
							try {
								resolved = require.resolve(target, {paths: [context, args.importer].filter(Boolean)});
							} catch (_e) {
								return undefined;
							}
						}
						return {path: normalizeBundlerPath(resolved)};
					}
				}

				if (args.path === 'ilib' || args.path === '@enact/i18n/ilib') {
					const checks = ['@enact/i18n/ilib', 'ilib'];
					for (const check of checks) {
						try {
							return {
								path: normalizeBundlerPath(require.resolve(check, {paths: [context, args.importer].filter(Boolean)}))
							};
						} catch (_e) {
							// continue
						}
					}
				}

				return undefined;
			});

			build.onLoad({filter: /node_modules[/\\]ilib[/\\]index\.js$/}, async args => {
				let source = await Bun.file(args.path).text();
				source = source.replace(/require\("\.\/lib\/ilib-[^"]+"\)/g, 'undefined');
				return {loader: 'js', contents: source};
			});
		}
	};
}

module.exports = {createResolveEnactPlugin, normalizeBundlerPath};
