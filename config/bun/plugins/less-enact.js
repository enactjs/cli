const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const less = require('less');
const sass = require('sass');
const {createPostcssEnactPlugin} = require('./postcss-enact');
const {resolveTildeImport} = require('./resolve-tilde-import');

function normalizePath (filePath) {
	return path.resolve(filePath).replace(/\\/g, '/');
}

function isModuleStylesheet (filePath, forceCSSModules) {
	return forceCSSModules || /\.module\.(css|less|scss|sass)$/.test(filePath);
}

function getCssCacheDir (appContext) {
	return path.join(appContext, 'node_modules', '.cache', 'enact-bun', 'css');
}

function isCachedCssAsset (filePath, cssCacheDir) {
	const normalized = normalizePath(filePath);
	const cacheRoot = normalizePath(cssCacheDir);
	return normalized === cacheRoot || normalized.startsWith(cacheRoot + '/');
}

function createLessTildePlugin (appContext) {
	class TildeFileManager extends less.FileManager {
		supports (filename) {
			return filename.charAt(0) === '~';
		}

		loadFile (filename, currentDirectory, options, environment) {
			const resolvedPath = resolveTildeImport(filename.slice(1), currentDirectory, appContext);
			return super.loadFile(resolvedPath, path.dirname(resolvedPath), options, environment);
		}
	}

	return {
		install (_less, pluginManager) {
			pluginManager.addFileManager(new TildeFileManager());
		},
		minVersion: [3, 0, 0]
	};
}

// The upward directory walk stats the same ancestor chain for every stylesheet
// in a package — cache per directory (search paths are per-dirname, not per-file).
const lessSearchPathCache = new Map();

function getLessSearchPaths (filePath, appContext) {
	const cacheKey = `${path.dirname(filePath)}\0${appContext}`;
	if (lessSearchPathCache.has(cacheKey)) {
		return lessSearchPathCache.get(cacheKey);
	}

	const paths = new Set([
		path.dirname(filePath),
		path.join(appContext, 'node_modules')
	]);

	let dir = path.dirname(filePath);
	while (dir) {
		if (
			fs.existsSync(path.join(dir, 'ThemeDecorator')) ||
			fs.existsSync(path.join(dir, 'MoonstoneDecorator')) ||
			fs.existsSync(path.join(dir, 'AgateDecorator'))
		) {
			paths.add(dir);
			const stylesDir = path.join(dir, 'styles');
			if (fs.existsSync(stylesDir)) {
				paths.add(stylesDir);
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	const result = [...paths];
	lessSearchPathCache.set(cacheKey, result);
	return result;
}

async function compileSass (source, filePath) {
	const result = sass.compileString(source, {
		url: new URL(`file:///${filePath.replace(/\\/g, '/')}`),
		loadPaths: [path.dirname(filePath)],
		style: 'expanded'
	});
	const deps = (result.loadedUrls || [])
		.filter(url => url.protocol === 'file:')
		.map(url => {
			try {
				return require('url').fileURLToPath(url);
			} catch (_e) {
				return null;
			}
		})
		.filter(Boolean);
	return {css: result.css, deps};
}

// Persistent compiled-stylesheet cache. less.render + the postcss chain cost
// hundreds of ms per sheet on the single JS thread and dominate build time.
// Entries are keyed by (mode, path, source) and validated against the
// mtime+size of every file the compiler read (@import graph), the same
// invalidation model webpack's loaders used.
function createStyleCache (appContext, options) {
	const cacheDir = path.join(appContext, 'node_modules', '.cache', 'enact-bun', 'style');
	const modeKey = JSON.stringify({
		v: 1,
		production: !!options.production,
		accent: options.accent || null,
		ri: options.ri === undefined ? null : options.ri,
		forceCSSModules: !!options.forceCSSModules,
		useTailwind: !!options.useTailwind
	});
	let cacheDirReady = false;

	const keyFor = (filePath, source) =>
		crypto.createHash('sha256')
			.update(modeKey)
			.update('\0')
			.update(filePath)
			.update('\0')
			.update(source)
			.digest('hex');

	const depUnchanged = dep => {
		try {
			const stat = fs.statSync(dep.path);
			return stat.mtimeMs === dep.mtimeMs && stat.size === dep.size;
		} catch (_e) {
			return false;
		}
	};

	// @import-json inlines JSON files at the postcss stage; those deps are not
	// visible in the compiler's import list, so such sheets are never cached.
	const isCacheable = source => !source.includes('import-json');

	return {
		get (filePath, source) {
			if (!isCacheable(source)) {
				return null;
			}
			try {
				const entryPath = path.join(cacheDir, `${keyFor(filePath, source)}.json`);
				const entry = JSON.parse(fs.readFileSync(entryPath, {encoding: 'utf8'}));
				if (entry.deps.every(depUnchanged)) {
					return entry;
				}
			} catch (_e) {
				// miss or unreadable entry
			}
			return null;
		},
		set (filePath, source, processed, depPaths) {
			if (!isCacheable(source)) {
				return;
			}
			if (!cacheDirReady) {
				fs.mkdirSync(cacheDir, {recursive: true});
				cacheDirReady = true;
			}
			const deps = [];
			for (const depPath of depPaths || []) {
				try {
					const stat = fs.statSync(depPath);
					deps.push({path: depPath, mtimeMs: stat.mtimeMs, size: stat.size});
				} catch (_e) {
					// unstatable dep — skip; absence is caught by depUnchanged
				}
			}
			try {
				fs.writeFileSync(
					path.join(cacheDir, `${keyFor(filePath, source)}.json`),
					JSON.stringify({css: processed.css, exports: processed.exports, deps}),
					{encoding: 'utf8'}
				);
			} catch (_e) {
				// caching is best-effort
			}
		}
	};
}

function writeCachedCssAsset (filePath, css, cssCacheDir) {
	fs.mkdirSync(cssCacheDir, {recursive: true});
	// Must NOT end in .module.css — Bun would re-scope already-scoped class names.
	const hash = crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 8);
	const base = path.basename(filePath).replace(/\W/g, '_');
	const target = path.join(cssCacheDir, `${base}_${hash}.css`);
	fs.writeFileSync(target, css, {encoding: 'utf8'});
	return normalizePath(target);
}

function createCssLoadResult (filePath, processed, moduleMode, cssCacheDir) {
	if (!moduleMode) {
		return {
			loader: 'css',
			contents: processed.css,
			resolveDir: path.dirname(filePath)
		};
	}

	// Bun only emits CSS loaded from the file namespace. Virtual-namespace
	// {loader:'css'} results are accepted then discarded — write a real file
	// and side-effect-import it from JS that exports the locals map.
	const target = writeCachedCssAsset(filePath, processed.css, cssCacheDir);

	return {
		loader: 'js',
		contents: [
			'import ' + JSON.stringify(target) + ';',
			'export default ' + JSON.stringify(processed.exports || {}) + ';'
		].join('\n')
	};
}

function createLessEnactPlugin (options = {}) {
	const postcssPlugin = createPostcssEnactPlugin(options);
	const appContext = options.context || process.cwd();
	const lessTildePlugin = createLessTildePlugin(appContext);
	const cssCacheDir = getCssCacheDir(appContext);
	const styleCache = createStyleCache(appContext, options);

	return {
		name: 'enact-less',
		setup (build) {
			build.onLoad({filter: /\.(scss|sass)$/}, async args => {
				if (isCachedCssAsset(args.path, cssCacheDir)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);

				const cached = styleCache.get(args.path, source);
				if (cached) {
					return createCssLoadResult(args.path, cached, moduleMode, cssCacheDir);
				}

				const sassResult = await compileSass(source, args.path);
				const processed = await postcssPlugin.processCss(sassResult.css, args.path, moduleMode);
				styleCache.set(args.path, source, processed, sassResult.deps);

				return createCssLoadResult(args.path, processed, moduleMode, cssCacheDir);
			});

			build.onLoad({filter: /\.less$/}, async args => {
				if (isCachedCssAsset(args.path, cssCacheDir)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);

				const cached = styleCache.get(args.path, source);
				if (cached) {
					return createCssLoadResult(args.path, cached, moduleMode, cssCacheDir);
				}

				const lessResult = await less.render(source, {
					filename: args.path,
					paths: getLessSearchPaths(args.path, appContext),
					modifyVars: Object.assign({__DEV__: !options.production}, options.accent || {}),
					javascriptEnabled: true,
					rewriteUrls: 'all',
					plugins: [lessTildePlugin]
				});

				const processed = await postcssPlugin.processCss(lessResult.css, args.path, moduleMode);
				styleCache.set(args.path, source, processed, lessResult.imports);

				return createCssLoadResult(args.path, processed, moduleMode, cssCacheDir);
			});

			build.onLoad({filter: /\.css$/}, async args => {
				// Cached assets are already postcss-processed; re-running with
				// forceCSSModules would recurse infinitely.
				if (isCachedCssAsset(args.path, cssCacheDir)) {
					return undefined;
				}

				const moduleMode = /\.module\.css$/.test(args.path) || options.forceCSSModules;
				const cssSource = await Bun.file(args.path).text();

				const cached = styleCache.get(args.path, cssSource);
				if (cached) {
					return createCssLoadResult(args.path, cached, moduleMode, cssCacheDir);
				}

				const cssProcessed = await postcssPlugin.processCss(cssSource, args.path, moduleMode);
				styleCache.set(args.path, cssSource, cssProcessed, []);

				return createCssLoadResult(args.path, cssProcessed, moduleMode, cssCacheDir);
			});
		}
	};
}

module.exports = {createLessEnactPlugin, isModuleStylesheet, getCssCacheDir, isCachedCssAsset};
