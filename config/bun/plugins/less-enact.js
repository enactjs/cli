const path = require('path');
const less = require('less');
const sass = require('sass');
const {createPostcssEnactPlugin} = require('./postcss-enact');
const {resolveTildeImport} = require('./resolve-tilde-import');

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

async function compileSass (source, filePath) {
	const result = sass.compileString(source, {
		url: new URL(`file:///${filePath.replace(/\\/g, '/')}`),
		loadPaths: [path.dirname(filePath)],
		style: 'expanded'
	});
	return result.css;
}

function createCssLoadResult (filePath, processed, moduleMode) {
	const result = {
		loader: 'css',
		contents: processed.css,
		resolveDir: path.dirname(filePath)
	};

	if (moduleMode) {
		result.exports = processed.exports;
	}

	return result;
}

function createLessEnactPlugin (options = {}) {
	const postcssPlugin = createPostcssEnactPlugin(options);
	const appContext = options.context || process.cwd();
	const lessTildePlugin = createLessTildePlugin(appContext);

	return {
		name: 'enact-less',
		setup (build) {
			build.onLoad({filter: /\.(scss|sass)$/}, async args => {
				const source = await Bun.file(args.path).text();
				const css = await compileSass(source, args.path);
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);
				const processed = await postcssPlugin.processCss(css, args.path, moduleMode);

				return createCssLoadResult(args.path, processed, moduleMode);
			});

			build.onLoad({filter: /\.less$/}, async args => {
				const source = await Bun.file(args.path).text();
				const lessResult = await less.render(source, {
					filename: args.path,
					paths: [path.dirname(args.path), path.join(appContext, 'node_modules')],
					modifyVars: Object.assign({__DEV__: !options.production}, options.accent || {}),
					javascriptEnabled: true,
					rewriteUrls: 'all',
					plugins: [lessTildePlugin]
				});

				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);
				const processed = await postcssPlugin.processCss(lessResult.css, args.path, moduleMode);

				return createCssLoadResult(args.path, processed, moduleMode);
			});

			build.onLoad({filter: /\.css$/}, async args => {
				const moduleMode = /\.module\.css$/.test(args.path) || options.forceCSSModules;
				const cssSource = await Bun.file(args.path).text();
				const cssProcessed = await postcssPlugin.processCss(cssSource, args.path, moduleMode);

				return createCssLoadResult(args.path, cssProcessed, moduleMode);
			});
		}
	};
}

module.exports = {createLessEnactPlugin, isModuleStylesheet};
