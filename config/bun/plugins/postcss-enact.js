const path = require('path');
const postcss = require('postcss');
const postcssImportJson = require('@daltontan/postcss-import-json');
const postcssModules = require('postcss-modules');
const {cssModuleIdent: getLocalIdent} = require('@enact/dev-utils');
const {
	resolveTildeImport,
	toCssRelativeImport,
	toBundlerCssUrl,
	parseImportPath,
	formatImportParams,
	createPostcssUrlPlugin,
	createPostcssImportAbsolutePlugin
} = require('./resolve-tilde-import');

function createPostcssImportTildePlugin (appContext = process.cwd()) {
	return {
		postcssPlugin: 'postcss-import-tilde',
		Once (root) {
			const inputFile = root.source?.input?.file || appContext;
			const currentFileDir = path.dirname(inputFile);

			root.walkAtRules(atRule => {
				if (atRule.name !== 'import' && atRule.name !== 'import-json') {
					return;
				}

				const src = parseImportPath(atRule.params);
				if (!src.startsWith('~')) {
					return;
				}

				try {
					const resolvedPath = resolveTildeImport(src.slice(1), currentFileDir, appContext);
					// @import-json resolves via Node from the stylesheet dir — keep relative.
					// Plain @import may be relocated into the css cache — pin absolute.
					const rewritten = atRule.name === 'import-json'
						? toCssRelativeImport(currentFileDir, resolvedPath)
						: toBundlerCssUrl(resolvedPath);
					atRule.params = formatImportParams(atRule.params, rewritten);
				} catch (error) {
					if (process.env.NODE_ENV !== 'test') {
						console.warn(`Could not resolve ${src}: ${error.message}`);
					}
				}
			});
		}
	};
}
createPostcssImportTildePlugin.postcss = true;

function buildPostcssPlugins (options = {}) {
	return [
		createPostcssImportTildePlugin(options.context),
		createPostcssImportAbsolutePlugin(options.context),
		createPostcssUrlPlugin(options.context),
		options.useTailwind && require('tailwindcss'),
		require('postcss-flexbugs-fixes'),
		require('postcss-preset-env')({
			autoprefixer: {flexbox: 'no-2009', remove: false},
			stage: 3,
			features: {'custom-properties': false}
		}),
		!options.useTailwind && require('postcss-normalize'),
		options.ri !== false && require('postcss-resolution-independence')(options.ri),
		postcssImportJson({
			map: (selector, value) => {
				if (typeof value === 'object' && value !== null && value.$ref) {
					const tokenPath = value.$ref.split('#/')[1];
					return `var(--${tokenPath.replace(/\//g, '-')})`;
				}
				return value;
			}
		})
	].filter(Boolean);
}

function createPostcssEnactPlugin (options = {}) {
	return {
		async processCss (source, filePath, asModule) {
			let moduleExports = {};
			const plugins = [...buildPostcssPlugins(options)];

			if (asModule) {
				plugins.unshift(
					postcssModules({
						generateScopedName: (name, filename) =>
							getLocalIdent(
								{resourcePath: filename || filePath, rootContext: options.context},
								'[name]_[local]',
								name
							),
						getJSON: (_cssFileName, cssExports) => {
							moduleExports = cssExports;
						}
					})
				);
			}

			const result = await postcss(plugins).process(source, {from: filePath});
			return {css: result.css, exports: asModule ? moduleExports : undefined};
		}
	};
}

module.exports = {createPostcssEnactPlugin, buildPostcssPlugins};
