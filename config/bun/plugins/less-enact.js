const path = require('path');
const fs = require('fs');
const less = require('less');
const sass = require('sass');
const {createPostcssEnactPlugin} = require('./postcss-enact');
const {resolveTildeImport} = require('./resolve-tilde-import');

const CSS_ASSET_NAMESPACE = 'enact-css-asset';
const CSS_ASSET_QUERY = '?enact-css';

function normalizePath (filePath) {
	return path.resolve(filePath).replace(/\\/g, '/');
}

function isModuleStylesheet (filePath, forceCSSModules) {
	return forceCSSModules || /\.module\.(css|less|scss|sass)$/.test(filePath);
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

function createCssLoadResult (filePath, processed, moduleMode, cssStore) {
	if (!moduleMode) {
		return {
			loader: 'css',
			contents: processed.css,
			resolveDir: path.dirname(filePath)
		};
	}

	// Bun ignores `exports` on the css loader, so CSS modules must return JS that
	// side-effect imports the processed CSS via a virtual namespace asset.
	const key = normalizePath(filePath);
	cssStore.set(key, processed.css);

	return {
		loader: 'js',
		contents: [
			'import ' + JSON.stringify(String(key + CSS_ASSET_QUERY)) + ';',
			'export default ' + JSON.stringify(processed.exports || {}) + ';'
		].join('\n')
	};
}

function createLessEnactPlugin (options = {}) {
	const postcssPlugin = createPostcssEnactPlugin(options);
	const appContext = options.context || process.cwd();
	const lessTildePlugin = createLessTildePlugin(appContext);
	const cssStore = new Map();

	return {
		name: 'enact-less',
		setup (build) {
			build.onResolve({filter: /\?enact-css$/}, args => ({
				path: normalizePath(args.path.replace(/\?enact-css$/, '')),
				namespace: CSS_ASSET_NAMESPACE
			}));

			build.onLoad({filter: /.*/, namespace: CSS_ASSET_NAMESPACE}, args => ({
				loader: 'css',
				contents: cssStore.get(normalizePath(args.path)) || ''
			}));

			build.onLoad({filter: /\.(scss|sass)$/}, async args => {
				const source = await Bun.file(args.path).text();
				const css = await compileSass(source, args.path);
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);
				const processed = await postcssPlugin.processCss(css, args.path, moduleMode);

				return createCssLoadResult(args.path, processed, moduleMode, cssStore);
			});

			build.onLoad({filter: /\.less$/}, async args => {
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

				return createCssLoadResult(args.path, processed, moduleMode, cssStore);
			});

			build.onLoad({filter: /\.css$/}, async args => {
				const moduleMode = /\.module\.css$/.test(args.path) || options.forceCSSModules;
				const cssSource = await Bun.file(args.path).text();
				const cssProcessed = await postcssPlugin.processCss(cssSource, args.path, moduleMode);

				return createCssLoadResult(args.path, cssProcessed, moduleMode, cssStore);
			});
		}
	};
}

module.exports = {createLessEnactPlugin, isModuleStylesheet};
