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

function getLessSearchPaths (filePath, appContext) {
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

	return [...paths];
}

async function compileSass (source, filePath) {
	const result = sass.compileString(source, {
		url: new URL(`file:///${filePath.replace(/\\/g, '/')}`),
		loadPaths: [path.dirname(filePath)],
		style: 'expanded'
	});
	return result.css;
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

	return {
		name: 'enact-less',
		setup (build) {
			build.onLoad({filter: /\.(scss|sass)$/}, async args => {
				if (isCachedCssAsset(args.path, cssCacheDir)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();
				const css = await compileSass(source, args.path);
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);
				const processed = await postcssPlugin.processCss(css, args.path, moduleMode);

				return createCssLoadResult(args.path, processed, moduleMode, cssCacheDir);
			});

			build.onLoad({filter: /\.less$/}, async args => {
				if (isCachedCssAsset(args.path, cssCacheDir)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();
				const lessResult = await less.render(source, {
					filename: args.path,
					paths: getLessSearchPaths(args.path, appContext),
					modifyVars: Object.assign({__DEV__: !options.production}, options.accent || {}),
					javascriptEnabled: true,
					rewriteUrls: 'all',
					plugins: [lessTildePlugin]
				});

				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);
				const processed = await postcssPlugin.processCss(lessResult.css, args.path, moduleMode);

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
				const cssProcessed = await postcssPlugin.processCss(cssSource, args.path, moduleMode);

				return createCssLoadResult(args.path, cssProcessed, moduleMode, cssCacheDir);
			});
		}
	};
}

module.exports = {createLessEnactPlugin, isModuleStylesheet, getCssCacheDir, isCachedCssAsset};
