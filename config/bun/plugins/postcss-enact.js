const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const postcssImportJson = require('@daltontan/postcss-import-json');
const postcssModules = require('postcss-modules');
const {cssModuleIdent: getLocalIdent} = require('@enact/dev-utils');

function createPostcssImportJsonTildePlugin () {
	return {
		postcssPlugin: 'postcss-import-json-tilde',
		Once (root) {
			root.walkAtRules('import-json', atRule => {
				let src = atRule.params.slice(1, -1);
				if (!src.startsWith('~')) return;

				const packagePath = src.substring(1);
				const currentFileDir = path.dirname(atRule.source.input.file || process.cwd());
				let resolvedPath;
				try {
					resolvedPath = require.resolve(packagePath, {paths: [currentFileDir]});
				} catch (e) {
					resolvedPath = require.resolve(packagePath, {paths: [process.cwd()]});
				}
				atRule.params = `"${path.relative(currentFileDir, resolvedPath)}"`;
			});
		}
	};
}
createPostcssImportJsonTildePlugin.postcss = true;

function buildPostcssPlugins (options = {}) {
	return [
		options.useTailwind && require('tailwindcss'),
		require('postcss-flexbugs-fixes'),
		require('postcss-preset-env')({
			autoprefixer: {flexbox: 'no-2009', remove: false},
			stage: 3,
			features: {'custom-properties': false}
		}),
		!options.useTailwind && require('postcss-normalize'),
		options.ri !== false && require('postcss-resolution-independence')(options.ri),
		createPostcssImportJsonTildePlugin(),
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
			let exports = {};
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
						getJSON: (_cssFileName, moduleExports) => {
							exports = moduleExports;
						}
					})
				);
			}

			const result = await postcss(plugins).process(source, {from: filePath});
			return {css: result.css, exports: asModule ? exports : undefined};
		}
	};
}

module.exports = {createPostcssEnactPlugin, buildPostcssPlugins};
