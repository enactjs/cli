const path = require('path');
const less = require('less');
const sass = require('sass');
const postcss = require('postcss');
const {createPostcssEnactPlugin} = require('./postcss-enact');

function isModuleStylesheet (filePath, forceCSSModules) {
	return forceCSSModules || /\.module\.(css|less|scss|sass)$/.test(filePath);
}

async function compileSass (source, filePath) {
	const result = sass.compileString(source, {
		url: new URL(`file:///${filePath.replace(/\\/g, '/')}`),
		loadPaths: [path.dirname(filePath)],
		style: 'expanded'
	});
	return result.css;
}

function createLessEnactPlugin (options = {}) {
	const postcssPlugin = createPostcssEnactPlugin(options);

	return {
		name: 'enact-less',
		setup (build) {
			build.onLoad({filter: /\.(scss|sass)$/}, async args => {
				const source = await Bun.file(args.path).text();
				const css = await compileSass(source, args.path);
				const processed = await postcssPlugin.processCss(css, args.path);
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);

				if (moduleMode) {
					return {
						loader: 'css',
						contents: processed.css,
						exports: processed.exports
					};
				}

				return {
					loader: 'css',
					contents: processed.css
				};
			});

			build.onLoad({filter: /\.less$/}, async args => {
				const source = await Bun.file(args.path).text();
				const lessResult = await less.render(source, {
					filename: args.path,
					paths: [path.dirname(args.path)],
					modifyVars: Object.assign({__DEV__: !options.production}, options.accent || {}),
					javascriptEnabled: true
				});

				const processed = await postcssPlugin.processCss(lessResult.css, args.path);
				const moduleMode = isModuleStylesheet(args.path, options.forceCSSModules);

				if (moduleMode) {
					return {
						loader: 'css',
						contents: processed.css,
						exports: processed.exports
					};
				}

				return {
					loader: 'css',
					contents: processed.css
				};
			});

			build.onLoad({filter: /\.css$/}, async args => {
				if (/\.module\.css$/.test(args.path) || options.forceCSSModules) {
					const source = await Bun.file(args.path).text();
					const processed = await postcssPlugin.processCss(source, args.path, true);
					return {
						loader: 'css',
						contents: processed.css,
						exports: processed.exports
					};
				}
				const source = await Bun.file(args.path).text();
				const processed = await postcssPlugin.processCss(source, args.path);
				return {
					loader: 'css',
					contents: processed.css
				};
			});
		}
	};
}

module.exports = {createLessEnactPlugin, isModuleStylesheet};
