const path = require('path');
const fs = require('fs');
const {resolveAppRootImport, isExternalUrl} = require('./resolve-tilde-import');

function normalizeBundlerPath (filePath) {
	return path.resolve(filePath).replace(/\\/g, '/');
}

const IMPORT_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.json', '.mjs', '.cjs'];

function resolveDirectoryEntry (dirPath) {
	const pkgPath = path.join(dirPath, 'package.json');
	if (fs.existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, {encoding: 'utf8'}));
			if (pkg.main) {
				const mainPath = resolveImportPath(path.resolve(dirPath, pkg.main));
				if (mainPath) {
					return mainPath;
				}
			}
		} catch (_e) {
			// continue
		}
	}

	for (const index of ['index.js', 'index.jsx', 'index.ts', 'index.tsx', 'index.mjs']) {
		const indexPath = path.join(dirPath, index);
		if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
			return indexPath;
		}
	}

	return null;
}

function resolveImportPath (requestPath) {
	const resolved = path.resolve(requestPath);

	if (fs.existsSync(resolved)) {
		const stat = fs.statSync(resolved);
		if (stat.isFile()) {
			return resolved;
		}
		if (stat.isDirectory()) {
			return resolveDirectoryEntry(resolved);
		}
	}

	for (const ext of IMPORT_EXTENSIONS) {
		const withExt = `${resolved}${ext}`;
		if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
			return withExt;
		}
	}

	return null;
}

function toResolveResult (filePath) {
	const absolutePath = path.resolve(filePath);
	if (
		!path.isAbsolute(absolutePath) ||
		!fs.existsSync(absolutePath) ||
		!fs.statSync(absolutePath).isFile()
	) {
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
		const resolved = resolveImportPath(path.join(modulePath, request));
		if (resolved) {
			return resolved;
		}
	}
	return null;
}

function getModuleSearchPaths (args, context, additionalModulePaths) {
	const paths = new Set();

	// Prefer the app context first (webpack resolve.modules: [./node_modules, ...])
	// so monorepo packages do not pull a second copy of shared deps like react.
	if (context) {
		paths.add(context);
	}
	for (const modulePath of additionalModulePaths) {
		paths.add(modulePath);
	}
	if (args.resolveDir) {
		paths.add(args.resolveDir);
	}
	if (args.importer) {
		paths.add(path.dirname(args.importer));
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

				if (path.isAbsolute(args.path)) {
					const absoluteImport = resolveImportPath(args.path);
					if (absoluteImport) {
						return toResolveResult(absoluteImport);
					}
				}

				if (args.path.startsWith('.') && args.resolveDir) {
					const relativeImport = resolveImportPath(path.resolve(args.resolveDir, args.path));
					if (relativeImport) {
						return toResolveResult(relativeImport);
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

				// Longest key first so `react-dom` wins over `react` for `react-dom/client`.
				const aliasKeys = Object.keys(aliases).sort((a, b) => b.length - a.length);
				for (const key of aliasKeys) {
					const exact = args.path === key;
					const prefixed = args.path.startsWith(key + '/');
					if (!exact && !prefixed) {
						continue;
					}

					const target = aliases[key];
					const suffix = exact ? '' : args.path.slice(key.length);
					let resolved = target;
					if (path.isAbsolute(target)) {
						const candidate = suffix ? path.join(target, suffix.slice(1)) : target;
						const absoluteImport = resolveImportPath(candidate);
						if (absoluteImport) {
							return toResolveResult(absoluteImport);
						}
						try {
							return toResolveResult(require.resolve(candidate, {paths: [context]}));
						} catch (_e) {
							return toResolveResult(normalizeBundlerPath(candidate));
						}
					}
					if (!target.startsWith('@')) {
						resolved = path.resolve(context, target);
						if (suffix) {
							resolved = path.join(resolved, suffix.slice(1));
						}
					} else {
						try {
							const request = exact ? target : target + suffix;
							resolved = require.resolve(request, {paths: [context, args.importer].filter(Boolean)});
						} catch (_e) {
							return undefined;
						}
					}
					return toResolveResult(resolved);
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

module.exports = {
	createResolveEnactPlugin,
	normalizeBundlerPath,
	toResolveResult,
	resolveImportPath
};
