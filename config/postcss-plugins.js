/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * Shared PostCSS plugin chain used by both `webpack.config.js` (via
 * `postcss-loader`) and `vite.config.js` (via `css.postcss.plugins`). Both
 * bundlers accept instantiated plugins, so `getPostCssPlugins` returns them
 * ready to use — a single source of truth for autoprefixing, resolution
 * independence, and JSON-token imports.
 */
const fs = require('fs');
const path = require('path');
const {optionParser: app} = require('@enact/dev-utils');

// Require and initialize a PostCSS plugin (invoking the creator with its options).
function loadPostCss (name, opts) {
	const mod = require(name);
	const creator = mod && mod.default ? mod.default : mod;
	return typeof creator === 'function' ? creator(opts) : creator;
}

// Support importing JSON files with the `~` alias in `@import-json` rules — a
// custom plugin that resolves the `~pkg` specifier to a path relative to the
// source file (mimicking webpack's `~` alias). Must run before the import-json
// plugin below.
function tildeJsonImportPlugin () {
	return {
		postcssPlugin: 'postcss-import-json-tilde',
		Once (root) {
			// Process all @import-json rules with ~ prefix first, before other plugins
			root.walkAtRules('import-json', atRule => {
				let src = atRule.params.slice(1, -1); // Remove quotes

				// Only handle ~ alias paths
				if (src.startsWith('~')) {
					const packagePath = src.substring(1); // Remove ~

					try {
						// Use Node.js standard module resolution
						// This mimics webpack's ~ alias behavior
						const currentFileDir = path.dirname(atRule.source.input.file || '');

						// Try to resolve the module using require.resolve
						// This follows standard Node.js module resolution algorithm
						let resolvedPath;
						try {
							// First try from current file's directory
							resolvedPath = require.resolve(packagePath, {
								paths: [currentFileDir]
							});
						} catch (e) {
							// Fallback to current working directory
							resolvedPath = require.resolve(packagePath, {
								paths: [process.cwd()]
							});
						}

						// Convert to relative path for the original plugin
						const relativePath = path.relative(currentFileDir, resolvedPath);
						atRule.params = `"${relativePath}"`;
					} catch (error) {
						// If resolution fails, try manual node_modules lookup
						try {
							let currentDir = path.dirname(atRule.source.input.file || process.cwd());
							let found = false;

							// Walk up directories to find node_modules
							while (currentDir !== path.parse(currentDir).root && !found) {
								const moduleDir = path.join(currentDir, 'node_modules', packagePath);
								if (fs.existsSync(moduleDir)) {
									const relativePath = path.relative(
										path.dirname(atRule.source.input.file || ''),
										moduleDir
									);
									atRule.params = `"${relativePath}"`;
									found = true;
									break;
								}
								currentDir = path.dirname(currentDir);
							}

							if (!found) {
								console.warn(`Could not resolve module path: ${packagePath}`);
							}
						} catch (fallbackError) {
							console.warn(`Failed to resolve ${packagePath}:`, fallbackError.message);
						}
					}
				}
			});
		}
	};
}

// The instantiated PostCSS plugin chain (order matters).
function getPostCssPlugins ({useTailwind}) {
	return [
		useTailwind && loadPostCss('tailwindcss'),
		// Fix and adjust for known flexbox issues. See https://github.com/philipwalton/flexbugs
		loadPostCss('postcss-flexbugs-fixes'),
		// Transpile stage-3 CSS standards based on browserslist targets, with auto-prefixing.
		loadPostCss('postcss-preset-env', {
			autoprefixer: {flexbox: 'no-2009', remove: false},
			stage: 3,
			features: {'custom-properties': false}
		}),
		// Standardize browser quirks based on the browserslist targets.
		!useTailwind && loadPostCss('postcss-normalize'),
		// Resolution independence support.
		app.ri !== false && loadPostCss('postcss-resolution-independence', app.ri),
		// Resolve `~pkg` prefixes in `@import-json` rules before the import-json plugin.
		tildeJsonImportPlugin(),
		// Support importing JSON files in CSS (design tokens -> CSS custom properties).
		loadPostCss('@daltontan/postcss-import-json', {
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

module.exports = {getPostCssPlugins, tildeJsonImportPlugin, loadPostCss};
