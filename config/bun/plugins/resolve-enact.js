const path = require('path');
const fs = require('fs');
const {resolveAppRootImport, isExternalUrl} = require('./resolve-tilde-import');

function normalizeBundlerPath (filePath) {
	return path.resolve(filePath).replace(/\\/g, '/');
}

function toResolveResult (filePath) {
	const absolutePath = path.resolve(filePath);
	if (!path.isAbsolute(absolutePath)) {
		return undefined;
	}

	return {path: normalizeBundlerPath(absolutePath)};
}

function isNodeBuiltin (request) {
	const normalized = request.replace(/^node:/, '');
	const builtins = require('module').builtinModules || [];
	return builtins.includes(normalized) || builtins.includes(`node:${normalized}`);
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

function getModuleSearchPaths (args, context, additionalModulePaths) {
	const paths = new Set();

	if (args.resolveDir) {
		paths.add(args.resolveDir);
	}
	if (args.importer) {
		paths.add(path.dirname(args.importer));
	}
	if (context) {
		paths.add(context);
	}
	for (const modulePath of additionalModulePaths) {
		paths.add(modulePath);
	}

	return [...paths];
}

function resolveNodeModule (request, searchPaths) {
	for (const searchPath of searchPaths) {
		try {
			return require.resolve(request, {paths: [searchPath]});
		} catch (_e) {
			// continue
		}
	}
	return null;
}

function createResolveEnactPlugin (options = {}) {
	const context = path.resolve(options.context || process.cwd());
	const aliases = options.aliases || {};
	const additionalModulePaths = normalizeAdditionalModulePaths(options.additionalModulePaths, context);

	return {
		name: 'enact-resolve',
		setup (build) {
			build.onResolve({filter: /.*/}, args => {
				if (isExternalUrl(args.path)) {
					return {external: true};
				}

				if (path.isAbsolute(args.path) && fs.existsSync(args.path)) {
					return toResolveResult(args.path);
				}

				if (args.path.startsWith('.') && args.resolveDir) {
					const relativePath = path.resolve(args.resolveDir, args.path);
					if (fs.existsSync(relativePath)) {
						return toResolveResult(relativePath);
					}
				}

				const appRootPath = resolveAppRootImport(args.path, context);
				if (appRootPath) {
					return toResolveResult(appRootPath);
				}

				if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) {
					if (isNodeBuiltin(args.path)) {
						return undefined;
					}

					const fromModulePaths = resolveFromModulePaths(args.path, additionalModulePaths);
					if (fromModulePaths) {
						return toResolveResult(fromModulePaths);
					}
				}

				for (const [key, target] of Object.entries(aliases)) {
					if (args.path === key) {
						let resolved = target;
						if (!path.isAbsolute(target) && !target.startsWith('@')) {
							resolved = path.resolve(context, target);
						} else {
							try {
								resolved = require.resolve(target, {paths: [context, args.importer].filter(Boolean)});
							} catch (_e) {
								return undefined;
							}
						}
						return toResolveResult(resolved);
					}
				}

				if (args.path === 'ilib' || args.path === '@enact/i18n/ilib') {
					const checks = ['@enact/i18n/ilib', 'ilib'];
					for (const check of checks) {
						try {
							return toResolveResult(require.resolve(check, {paths: [context, args.importer].filter(Boolean)}));
						} catch (_e) {
							// continue
						}
					}
				}

				if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) {
					const searchPaths = getModuleSearchPaths(args, context, additionalModulePaths);
					const resolved = resolveNodeModule(args.path, searchPaths);
					if (resolved) {
						return toResolveResult(resolved);
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

module.exports = {createResolveEnactPlugin, normalizeBundlerPath, toResolveResult};
