/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
// @remove-on-eject-begin
/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 * https://github.com/facebook/create-react-app
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @remove-on-eject-end

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {spawn} = require('child_process');
const resolve = require('resolve');
const ejs = require('ejs');
const postcss = require('postcss');
const postcssModules = require('postcss-modules');
const postcssImport = require('postcss-import');
const postcssUrl = require('postcss-url');
const less = require('less');
const LessPluginNpmImport = require('less-plugin-npm-import');
const sass = require('sass');
const babel = require('@babel/core');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const {optionParser: app, cssModuleIdent: getLocalIdent} = require('@enact/dev-utils');

// GracefulFsPlugin had patched webpack's internal NodeOutputFilesystem to
// avoid EMFILE errors under heavy file-handle load. esbuild's own file I/O
// happens inside its Go binary and can't be patched from Node, but we can at
// least gracefulify our own Node-side fs usage in this config/its plugins.
try {
	require('graceful-fs').gracefulify(fs);
} catch (e) {
	// graceful-fs not installed; safe to ignore.
}

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
module.exports = function (
	env,
	noLinting = false,
	contentHash = false,
	isomorphic = false,
	noAnimation = false,
	noSplitCSS = false,
	ilibAdditionalResourcesPath
) {
	process.chdir(app.context);

	// Load applicable .env files into environment variables.
	require('./dotenv').load(app.context);

	// Sets the browserslist default fallback set of browsers to the Enact default browser support list.
	app.setEnactTargetsAsDefault();

	// Check if TypeScript is setup
	const useTypeScript = fs.existsSync('tsconfig.json');

	// Check if Tailwind config exists
	const useTailwind = fs.existsSync(path.join(app.context, 'tailwind.config.js'));

	process.env.NODE_ENV = env || process.env.NODE_ENV;
	const isEnvProduction = process.env.NODE_ENV === 'production';

	const publicPath = getPublicUrlOrPath(!isEnvProduction, app.publicUrl, process.env.PUBLIC_URL).replace(/^\/$/, '');

	// Source maps are resource heavy and can cause out of memory issue for large source files.
	// By default, sourcemaps will be used in development, however it can universally forced
	// on or off by setting the GENERATE_SOURCEMAP environment variable.
	const GENERATE_SOURCEMAP = process.env.GENERATE_SOURCEMAP || (isEnvProduction ? 'false' : 'true');
	const shouldUseSourceMap = GENERATE_SOURCEMAP !== 'false';

	const outdir = path.resolve('./dist');
	const entryNames = contentHash ? '[name].[hash]' : '[name]';
	const chunkNames = contentHash ? 'chunk.[name].[hash]' : 'chunk.[name]';
	const assetNames = contentHash ? '[dir]/[name].[hash]' : '[dir]/[name]';

	const getAdditionalModulePaths = paths => {
		if (!paths) return [];
		return Array.isArray(paths) ? paths : [paths];
	};

	// Resolves a `~pkg/sub/path` (or bare `pkg/sub/path`) specifier to an
	// absolute file path by finding the package's directory (via its
	// package.json, which sidesteps any `exports` map restriction on the
	// specific subpath, same trick used for the eslint/tsc bin resolution
	// below) and joining the remaining subpath onto it. Shared by the CSS
	// `@import` and `url()` handling below, and by the JSON tilde-import
	// plugin.
	function resolveTildeSpecifier (specifier, basedir) {
		const clean = specifier.replace(/^~/, '');
		const match = clean.match(/^(@[^/]+\/[^/]+|[^/]+)(\/.*)?$/);
		if (!match) return null;
		const [, pkgName, subpath] = match;
		try {
			const pkgJsonPath = resolve.sync(`${pkgName}/package.json`, {basedir});
			const pkgDir = path.dirname(pkgJsonPath);
			return subpath ? path.join(pkgDir, subpath) : pkgDir;
		} catch (e) {
			return null;
		}
	}

	// Copies a resolved asset (font, image, etc. referenced via CSS `url()`)
	// into the build output and returns the public URL to use in its place —
	// this is the `url()` half of what css-loader/file-loader used to do
	// together automatically.
	function copyCssAsset (resolvedAbsPath) {
		const ext = path.extname(resolvedAbsPath);
		const hash = crypto.createHash('md5').update(fs.readFileSync(resolvedAbsPath)).digest('hex').slice(0, 8);
		const destRelPath = path.join('assets', `${path.basename(resolvedAbsPath, ext)}.${hash}${ext}`);
		const destAbsPath = path.join(outdir, destRelPath);
		fs.mkdirSync(path.dirname(destAbsPath), {recursive: true});
		fs.copyFileSync(resolvedAbsPath, destAbsPath);
		return `${publicPath}/${destRelPath.replace(/\\/g, '/')}`;
	}

	// ---------------------------------------------------------------------
	// PostCSS pipeline. This mirrors the plugin list from the original
	// `postcss-loader` options object exactly, just invoked directly with
	// the `postcss` API instead of through webpack's loader chain.
	// ---------------------------------------------------------------------
	const tildeImportJsonPlugin = {
		postcssPlugin: 'postcss-import-json-tilde',
		Once (root) {
			root.walkAtRules('import-json', atRule => {
				let src = atRule.params.slice(1, -1); // Remove quotes
				if (src.startsWith('~')) {
					const packagePath = src.substring(1);
					try {
						const currentFileDir = path.dirname(atRule.source.input.file || '');
						let resolvedPath;
						try {
							resolvedPath = require.resolve(packagePath, {paths: [currentFileDir]});
						} catch (e) {
							resolvedPath = require.resolve(packagePath, {paths: [process.cwd()]});
						}
						const relativePath = path.relative(currentFileDir, resolvedPath);
						atRule.params = `"${relativePath}"`;
					} catch (error) {
						try {
							let currentDir = path.dirname(atRule.source.input.file || process.cwd());
							let found = false;
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

	// `getLocalIdent` (aka `cssModuleIdent`) was written for css-loader's
	// `modules.getLocalIdent` API: `(loaderContext, localIdentName, localName)`,
	// where `loaderContext` is a webpack loader context object with
	// `resourcePath`/`rootContext`. `postcss-modules`' `generateScopedName`
	// option instead calls `(name, filename, css)` with plain strings and
	// the arguments in a different order — this adapter bridges the two.
	function adaptGetLocalIdent (name, filename) {
		const fakeLoaderContext = {resourcePath: filename, rootContext: app.context};
		return getLocalIdent(fakeLoaderContext, '[path][name]__[local]', name);
	}

	// Replicates enough of postcss-import's default resolution (absolute,
	// then relative-to-file) plus tilde/bare-package resolution for
	// `@import` statements in plain .css/.scss files — the equivalent of
	// what css-loader used to do transparently. LESS files are unaffected
	// here since `less-plugin-npm-import` already resolves their `@import`s
	// before postcss ever sees the output.
	function resolveCssImport (id, basedir) {
		if (id.startsWith('~')) {
			const resolved = resolveTildeSpecifier(id, basedir);
			if (resolved) return resolved;
		}
		if (path.isAbsolute(id) && fs.existsSync(id)) return id;
		const relPath = path.resolve(basedir, id);
		if (fs.existsSync(relPath)) return relPath;
		const bareResolved = resolveTildeSpecifier(id, basedir);
		if (bareResolved) return bareResolved;
		throw new Error(`Could not resolve CSS @import "${id}" from ${basedir}`);
	}

	// Handles `url()` references (fonts, images, etc.) — the other half of
	// what css-loader used to do: copies the referenced file into the build
	// output and rewrites the URL to point at it. Understands the same `~`
	// tilde npm-package convention as the @import handling above; leaves
	// data: URIs and http(s) URLs untouched.
	function handleCssUrl (asset, dir) {
		if (/^(data:|https?:)/.test(asset.url)) return asset.url;
		let resolvedPath = null;
		if (asset.url.startsWith('~')) {
			resolvedPath = resolveTildeSpecifier(asset.url, path.dirname(dir.from));
		} else if (asset.absolutePath && fs.existsSync(asset.absolutePath)) {
			resolvedPath = asset.absolutePath;
		}
		if (!resolvedPath || !fs.existsSync(resolvedPath)) return asset.url;
		return copyCssAsset(resolvedPath);
	}

	function buildPostcssPlugins ({withModules, getJSON} = {}) {
		const plugins = [
			postcssImport({resolve: resolveCssImport}),
			useTailwind && require('tailwindcss'),
			require('postcss-flexbugs-fixes'),
			require('postcss-preset-env')({
				autoprefixer: {flexbox: 'no-2009', remove: false},
				stage: 3,
				features: {'custom-properties': false}
			}),
			!useTailwind && require('postcss-normalize'),
			app.ri !== false && require('postcss-resolution-independence')(app.ri),
			postcssUrl({url: handleCssUrl}),
			tildeImportJsonPlugin,
			require('@daltontan/postcss-import-json')({
				map: (selector, value) => {
					if (typeof value === 'object' && value !== null && value.$ref) {
						const tokenPath = value.$ref.split('#/')[1];
						const cssVariableName = '--' + tokenPath.replace(/\//g, '-');
						return `var(${cssVariableName})`;
					}
					return value;
				}
			})
		].filter(Boolean);

		if (withModules) {
			plugins.push(
				postcssModules({
					generateScopedName: !isEnvProduction ? adaptGetLocalIdent : undefined,
					getJSON
				})
			);
		}

		return plugins;
	}

	// Compiles LESS/SCSS/CSS source down to plain CSS text (this replaces the
	// less-loader / sass-loader / css-loader chain).
	async function compileToCss (filePath, source) {
		if (/\.less$/.test(filePath)) {
			// Note: we deliberately don't pass a `sourceMap` option here. less's
			// internal sourcemap writer expects a fully-specified options
			// object (e.g. a base path) and throws a confusing
			// `path.relative(..., undefined)` error if given an empty one; and
			// since we only use `result.css` below (esbuild generates its own
			// overall sourcemap separately), there's nothing to gain from it
			// yet. Revisit if per-file LESS source mapping through to esbuild's
			// sourcemap is needed later.
			const result = await less.render(source, {
				filename: filePath,
				plugins: [new LessPluginNpmImport({prefix: '~'})],
				modifyVars: Object.assign({__DEV__: !isEnvProduction}, app.accent)
			});
			return result.css;
		}
		if (/\.s[ac]ss$/.test(filePath)) {
			const result = sass.compile(filePath, {sourceMap: shouldUseSourceMap});
			return result.css;
		}
		return source;
	}

	// A shared cache so the `.module.*` JS shim (which "imports" a virtual
	// `?css-module-raw` path) and the loader that resolves that virtual path
	// can share the already-processed CSS text without recompiling twice.
	const cssModuleCache = new Map();

	// ---------------------------------------------------------------------
	// esbuild plugin: styles (CSS / LESS / SCSS, with or without CSS Modules)
	// Replaces MiniCssExtractPlugin / style-loader / css-loader / postcss-loader
	// / less-loader / sass-loader.
	// ---------------------------------------------------------------------
	const stylesPlugin = {
		name: 'enact-styles',
		setup (build) {
			// Virtual namespace used to hand the already-processed CSS for a
			// `.module.*` file back to esbuild so it still gets bundled/
			// extracted as a normal CSS asset.
			build.onResolve({filter: /\?css-module-raw$/}, args => ({
				path: args.path.replace(/\?css-module-raw$/, ''),
				namespace: 'css-module-raw'
			}));
			build.onLoad({filter: /.*/, namespace: 'css-module-raw'}, args => ({
				contents: cssModuleCache.get(args.path) || '',
				loader: 'css',
				resolveDir: path.dirname(args.path)
			}));

			build.onLoad({filter: /\.module\.(css|less|scss|sass)$/}, async args => {
				const source = fs.readFileSync(args.path, 'utf8');
				const rawCss = await compileToCss(args.path, source);

				let tokens = {};
				const result = await postcss(
					buildPostcssPlugins({
						withModules: true,
						getJSON (cssPath, json) {
							tokens = json;
						}
					})
				).process(rawCss, {from: args.path, map: shouldUseSourceMap});

				cssModuleCache.set(args.path, result.css);

				const exportsLiteral = JSON.stringify(tokens);
				if (process.env.INLINE_STYLES) {
					// style-loader equivalent: inject a <style> tag at runtime
					// instead of extracting to a separate .css file.
					return {
						contents:
							`const css = ${JSON.stringify(result.css)};\n` +
							`const style = document.createElement('style');\n` +
							`style.textContent = css;\n` +
							`document.head.appendChild(style);\n` +
							`export default ${exportsLiteral};\n`,
						loader: 'js',
						resolveDir: path.dirname(args.path)
					};
				}

				return {
					// Importing the virtual raw-css path lets esbuild bundle/
					// extract the CSS the normal way, while this JS module
					// still exports the class-name token map.
					contents:
						`import ${JSON.stringify(args.path + '?css-module-raw')};\n` +
						`export default ${exportsLiteral};\n`,
					loader: 'js',
					resolveDir: path.dirname(args.path)
				};
			});

			// Go's regexp engine (used by esbuild's onLoad filters) doesn't
			// support lookbehind, so this can't exclude `.module.*` files by
			// pattern. It doesn't need to: esbuild only invokes the first
			// registered onLoad whose filter matches a given file, and the
			// `.module.(css|less|scss|sass)` handler above is registered
			// first, so `.module.*` files never reach this one.
			build.onLoad({filter: /\.(css|less|scss|sass)$/}, async args => {
				const source = fs.readFileSync(args.path, 'utf8');
				const rawCss = await compileToCss(args.path, source);
				const result = await postcss(
					buildPostcssPlugins({
						// `app.forceCSSModules` mirrors the original `icss`/getLocalIdent
						// toggle for non-`.module.` stylesheets.
						withModules: Boolean(app.forceCSSModules),
						getJSON () {}
					})
				).process(rawCss, {from: args.path, map: shouldUseSourceMap});

				if (process.env.INLINE_STYLES) {
					return {
						contents:
							`const css = ${JSON.stringify(result.css)};\n` +
							`const style = document.createElement('style');\n` +
							`style.textContent = css;\n` +
							`document.head.appendChild(style);\n`,
						loader: 'js',
						resolveDir: path.dirname(args.path)
					};
				}

				return {contents: result.css, loader: 'css', resolveDir: path.dirname(args.path)};
			});
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugin: Babel. Replaces babel-loader. Note esbuild's own
	// TS/JSX transform is bypassed for matched files since Babel already
	// strips types/JSX per `babel.config.js` (kept for Enact-specific
	// transforms); esbuild's `source-map-loader` step (for consuming
	// upstream .map files from dependencies) has no direct replacement here.
	// ---------------------------------------------------------------------
	const babelPlugin = {
		name: 'enact-babel',
		setup (build) {
			build.onLoad({filter: /\.(js|mjs|jsx|ts|tsx)$/}, args => {
				if (/node_modules/.test(args.path) && !/node_modules[\\/]@enact/.test(args.path)) {
					return null; // let esbuild's default JS loader handle third-party code
				}
				const result = babel.transformFileSync(args.path, {
					configFile: path.join(__dirname, 'babel.config.js'),
					babelrc: false,
					sourceMaps: shouldUseSourceMap,
					compact: isEnvProduction
				});
				return {contents: result.code, loader: 'js', resolveDir: path.dirname(args.path)};
			});
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugin: HTML output. Replaces HtmlWebpackPlugin. Reads the same
	// EJS template and injects <script>/<link> tags for whatever esbuild
	// actually emitted, using the build's metafile.
	// ---------------------------------------------------------------------
	const htmlPlugin = {
		name: 'enact-html',
		setup (build) {
			build.initialOptions.metafile = true;
			build.onEnd(async result => {
				if (!result.metafile) return;
				const outputs = Object.keys(result.metafile.outputs);
				const scripts = outputs
					.filter(f => f.endsWith('.js') && !f.endsWith('.map'))
					.map(f => `${publicPath}/${path.relative(outdir, path.resolve(f))}`.replace(/\\/g, '/'));
				const styles = outputs
					.filter(f => f.endsWith('.css'))
					.map(f => `${publicPath}/${path.relative(outdir, path.resolve(f))}`.replace(/\\/g, '/'));

				const template = app.template || path.join(__dirname, 'html-template.ejs');
				const html = await ejs.renderFile(template, {
					htmlWebpackPlugin: {
						files: {js: scripts, css: styles},
						options: {title: app.title || ''}
					}
				});

				// The real template only reads `htmlWebpackPlugin.options.title` —
				// it has no injection points of its own for scripts/styles.
				// HtmlWebpackPlugin normally injects those automatically after
				// rendering (its `inject: 'body'` option), so we replicate that
				// here: CSS <link> tags into <head>, JS <script> tags before
				// </body>, matching the `defer` attribute the old output used.
				const linkTags = styles.map(href => `\t\t<link rel="stylesheet" href="${href}">`).join('\n');
				const scriptTags = scripts.map(src => `\t<script defer src="${src}"></script>`).join('\n');

				let finalHtml = html;
				if (linkTags) {
					finalHtml = finalHtml.includes('</head>') ?
						finalHtml.replace('</head>', `${linkTags}\n\t</head>`) :
						finalHtml;
				}
				if (scriptTags) {
					finalHtml = finalHtml.includes('</body>') ?
						finalHtml.replace('</body>', `${scriptTags}\n</body>`) :
						finalHtml + scriptTags;
				}
				// Naive equivalent of HtmlWebpackPlugin's production `minify`
				// option; swap in `html-minifier-terser` for full parity.
				if (isEnvProduction) {
					finalHtml = finalHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/\n\s*\n/g, '\n');
				}

				fs.mkdirSync(outdir, {recursive: true});
				fs.writeFileSync(path.join(outdir, 'index.html'), finalHtml);
			});
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugin: Node built-in / ilib environment-loader stubs.
	// NodePolyfillPlugin used to alias core Node modules (fs, util, stream,
	// etc.) to browser polyfills; esbuild does none of that automatically.
	// Separately, ilib's own source contains runtime `typeof` guarded
	// requires for other JS engines (`ilib-qt.js`, `ilib-rhino.js`,
	// `ilib-ringo.js`) that are dead code in a browser but don't exist in
	// this installed package — webpack tolerated the unresolved require at
	// bundle time, esbuild does not. Both get stubbed here rather than
	// failing the build.
	// ---------------------------------------------------------------------
	const nodeBuiltinStubsPlugin = {
		name: 'enact-node-builtin-stubs',
		setup (build) {
			// `util` has real, commonly-used behavior (format/inherits/etc.),
			// so prefer the actual browser-compatible `util` npm package over
			// an empty stub when it's available.
			build.onResolve({filter: /^util$/}, () => {
				try {
					return {path: require.resolve('util/')};
				} catch (e) {
					return {path: 'util', namespace: 'enact-empty-stub'};
				}
			});

			// Everything else that's a genuine Node builtin (fs, child_process,
			// net, etc.) has no meaningful browser equivalent for this app;
			// resolve to an empty module rather than failing the bundle.
			const nodeBuiltins = new Set(require('module').builtinModules);
			build.onResolve({filter: /.*/}, args => {
				if (nodeBuiltins.has(args.path) && args.path !== 'util') {
					return {path: args.path, namespace: 'enact-empty-stub'};
				}
				return null;
			});

			// ilib's alternate-JS-engine loaders: never reached at runtime in
			// a browser, and not present in this package install.
			build.onResolve({filter: /ilib-(qt|rhino|ringo)\.js$/}, args => ({
				path: args.path,
				namespace: 'enact-empty-stub'
			}));

			build.onLoad({filter: /.*/, namespace: 'enact-empty-stub'}, () => ({
				contents: 'module.exports = {};',
				loader: 'js'
			}));
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugin: case-sensitive path checking. Replaces
	// case-sensitive-paths-webpack-plugin by verifying the on-disk casing of
	// every resolved import matches the casing actually requested.
	// ---------------------------------------------------------------------
	const caseSensitivePathsPlugin = {
		name: 'enact-case-sensitive-paths',
		setup (build) {
			build.onLoad({filter: /.*/}, args => {
				const dir = path.dirname(args.path);
				const base = path.basename(args.path);
				try {
					const actual = fs.readdirSync(dir);
					if (!actual.includes(base)) {
						const match = actual.find(f => f.toLowerCase() === base.toLowerCase());
						if (match) {
							throw new Error(
								`Case-sensitive path mismatch: requested "${base}" but found "${match}" in ${dir}`
							);
						}
					}
				} catch (e) {
					if (e.message.startsWith('Case-sensitive')) throw e;
					// Directory read failed for an unrelated reason (e.g. virtual
					// namespace); ignore and let normal loading continue.
				}
				return null;
			});
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugins: TypeScript type-checking and ESLint. Neither esbuild
	// transform nor bundling does type-checking or linting, so both run as
	// separate, non-blocking child processes on each build, mirroring
	// ForkTsCheckerWebpackPlugin's `async` mode and ESLintPlugin.
	// ---------------------------------------------------------------------
	// Modern `typescript`/`eslint` versions declare a package.json `exports`
	// map that doesn't list their `bin/*` scripts as importable subpaths, so
	// `resolve.sync('pkg/bin/x', ...)` fails even though the file exists on
	// disk. Resolving the package's `package.json` (always exported) and
	// joining the known relative bin path onto its directory sidesteps the
	// exports-map restriction, since it's plain filesystem path math rather
	// than asking Node's resolver for a blocked subpath.
	function resolveBin (pkgName, relativeBinPath, basedir) {
		const pkgJsonPath = resolve.sync(`${pkgName}/package.json`, {basedir});
		return path.join(path.dirname(pkgJsonPath), relativeBinPath);
	}

	// esbuild's serve() reruns the full build (and therefore every onEnd
	// hook) on every single request it handles — not just on source changes.
	// Spawning a brand-new eslint/tsc process per request would pile up
	// concurrent processes and thrash the machine, so each of these guards
	// against overlapping runs and simply skips re-spawning while a previous
	// invocation is still in flight.
	let typeCheckRunning = false;
	const typeCheckPlugin = useTypeScript && {
		name: 'enact-ts-typecheck',
		setup (build) {
			build.onEnd(() => {
				if (typeCheckRunning) return;
				typeCheckRunning = true;
				const tsc = resolveBin('typescript', 'bin/tsc', app.context);
				const child = spawn(process.execPath, [tsc, '--noEmit', '--incremental'], {
					stdio: 'inherit',
					cwd: app.context
				});
				child.on('error', err => console.warn('Type-check failed to start:', err.message));
				child.on('exit', () => {
					typeCheckRunning = false;
				});
			});
		}
	};

	let eslintRunning = false;
	const eslintPlugin = !noLinting && {
		name: 'enact-eslint',
		setup (build) {
			build.onEnd(() => {
				if (eslintRunning) return;
				eslintRunning = true;
				const eslintBin = resolveBin('eslint', 'bin/eslint.js', __dirname);
				// ESLint 9's flat config has no `--ext` flag; file patterns are
				// passed as glob arguments instead.
				const args = [eslintBin, 'src/**/*.{js,mjs,jsx,ts,tsx}'];
				// @remove-on-eject-begin
				args.push('--config', require.resolve('./eslintWebpackPluginConfig'));
				// @remove-on-eject-end
				const child = spawn(process.execPath, args, {stdio: 'inherit', cwd: app.context});
				child.on('error', err => console.warn('ESLint failed to start:', err.message));
				child.on('exit', () => {
					eslintRunning = false;
				});
			});
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugins: Enact-specific asset pipelines. ILibPlugin and
	// WebOSMetaPlugin originally hooked into webpack's compiler asset
	// pipeline directly; this is a best-effort reimplementation of their
	// documented behavior (copying ilib locale resources and webOS meta
	// assets into the output directory). Verify against the actual
	// @enact/dev-utils source before relying on this for a real build.
	// ---------------------------------------------------------------------
	function copyDirSync (src, dest) {
		if (!fs.existsSync(src)) return;
		fs.mkdirSync(dest, {recursive: true});
		for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
			const s = path.join(src, entry.name);
			const d = path.join(dest, entry.name);
			if (entry.isDirectory()) {
				copyDirSync(s, d);
			} else {
				fs.copyFileSync(s, d);
			}
		}
	}

	// Finds ilib's actual bundled locale data directory (containing
	// localeinfo.json, plurals.json, scripts.json, ilibmanifest.json, and
	// per-locale subfolders), based on the concrete request paths ilib
	// issues at runtime: `/locale/...` and `/ilib/locale/...`.
	function findIlibLocaleDir () {
		const attempts = [
			() => path.dirname(resolve.sync('ilib/locale/localeinfo.json', {basedir: app.context})),
			() => path.dirname(resolve.sync('@enact/i18n/ilib/locale/localeinfo.json', {basedir: app.context}))
		];
		for (const attempt of attempts) {
			try {
				return attempt();
			} catch (e) {
				// try the next candidate
			}
		}
		return null;
	}

	let ilibAssetsCopied = false;
	const ilibAssetsPlugin = {
		name: 'enact-ilib-assets',
		setup (build) {
			build.onEnd(() => {
				if (ilibAssetsCopied) return;
				ilibAssetsCopied = true;
				const ilibResourceDirs = [
					path.join(app.context, 'resources'),
					ilibAdditionalResourcesPath
				].filter(Boolean);
				ilibResourceDirs.forEach(dir => copyDirSync(dir, path.join(outdir, 'resources')));

				// ilib requests locale data from both `/locale/...` and
				// `/ilib/locale/...` at runtime, so serve it at both paths
				// rather than guessing which one the installed version needs.
				const ilibLocaleDir = findIlibLocaleDir();
				if (ilibLocaleDir) {
					copyDirSync(ilibLocaleDir, path.join(outdir, 'locale'));
					copyDirSync(ilibLocaleDir, path.join(outdir, 'ilib', 'locale'));
				} else {
					console.warn(
						'Could not locate ilib\'s locale data directory (tried "ilib" and ' +
						'"@enact/i18n/ilib"); locale-dependent features may not work.'
					);
				}
			});
		}
	};

	let webosMetaCopied = false;
	const webosMetaAssetsPlugin = {
		name: 'enact-webos-meta-assets',
		setup (build) {
			build.onEnd(() => {
				if (webosMetaCopied) return;
				webosMetaCopied = true;
				const appInfoCandidates = [
					path.join(app.context, 'appinfo.json'),
					path.join(app.context, 'webos-meta', 'appinfo.json')
				];
				const appInfoPath = appInfoCandidates.find(p => fs.existsSync(p));
				if (appInfoPath) {
					fs.copyFileSync(appInfoPath, path.join(outdir, 'appinfo.json'));
					const metaDir = path.join(path.dirname(appInfoPath), 'webos-meta');
					copyDirSync(metaDir, path.join(outdir, 'webos-meta'));
				}
			});
		}
	};

	// ---------------------------------------------------------------------
	// `define` replacement for DefinePlugin + EnvironmentPlugin.
	// ---------------------------------------------------------------------
	const define = {
		'process.env.NODE_ENV': JSON.stringify(isEnvProduction ? 'production' : 'development'),
		'process.env.PUBLIC_URL': JSON.stringify(publicPath),
		ENACT_PACK_ISOMORPHIC: JSON.stringify(isomorphic),
		ENACT_PACK_NO_ANIMATION: JSON.stringify(noAnimation),
		// NodePolyfillPlugin used to shim this for us. `polyfills.js` (and
		// potentially other deps) reference Node-style `global`, which
		// doesn't exist in a browser; map it to `globalThis`.
		global: 'globalThis'
	};
	Object.keys(process.env)
		.filter(key => /^(REACT_APP|WDS_SOCKET)/.test(key))
		.forEach(key => {
			define[`process.env.${key}`] = JSON.stringify(process.env[key]);
		});

	// ---------------------------------------------------------------------
	// Final esbuild build-options object, consumed by `esbuild.context()` in
	// both the dev server (serve.js) and the production build script.
	// ---------------------------------------------------------------------
	return {
		// esbuild's object-form entryPoints only accepts one file per key
		// (unlike webpack's `entry.main: [file, file]` array-merge). The
		// polyfills file is instead prepended via `inject`, which runs a
		// side-effect module before the entry point in the same bundle.
		entryPoints: {main: app.context},
		inject: [require.resolve('./polyfills')],
		bundle: true,
		outdir,
		entryNames,
		chunkNames,
		assetNames,
		publicPath,
		platform: 'browser',
		// esbuild's `target` wants engine identifiers (e.g. "chrome100"), not
		// a browserslist query; if you have `browserslist-to-esbuild`
		// installed, swap the line below to convert `app.environment`
		// automatically. Defaulting to a modern baseline otherwise.
		target: 'es2019',
		minify: isEnvProduction,
		sourcemap: shouldUseSourceMap ? (isEnvProduction ? true : 'linked') : false,
		logLevel: 'info',
		metafile: true,
		absWorkingDir: app.context,
		// NodePolyfillPlugin equivalent: esbuild does not auto-polyfill node
		// builtins for the browser platform the way webpack 4 used to.
		// `alias` below only remaps bare imports of these names; it does not
		// polyfill globals like `process`/`Buffer` referenced without an
		// import. Add real shims via `inject` if your app relies on those.
		alias: Object.assign(
			{
				// Pinning react/react-dom/react-is to one resolved path (rather
				// than letting each importer resolve its own nearest copy) is
				// what webpack's `resolve.modules` list (app's own node_modules
				// checked first, for every resolution) used to guarantee for
				// free. Without this, packages under @enact/* can end up
				// bundling a different nested copy of react than the app uses,
				// producing "Invalid hook call" / duplicate-React errors.
				react: path.dirname(resolve.sync('react/package.json', {basedir: app.context})),
				'react-dom': path.dirname(resolve.sync('react-dom/package.json', {basedir: app.context})),
				'react-is': path.dirname(resolve.sync('react-is/package.json', {basedir: app.context}))
			},
			fs.existsSync(path.join(app.context, 'node_modules', '@enact', 'i18n', 'ilib')) ?
				{ilib: '@enact/i18n/ilib'} :
				{'@enact/i18n/ilib': 'ilib'},
			app.alias
		),
		nodePaths: [
			path.resolve('./node_modules'),
			...getAdditionalModulePaths(app.additionalModulePaths)
		],
		loader: {
			'.png': 'file',
			'.jpg': 'file',
			'.jpeg': 'file',
			'.gif': 'file',
			'.svg': 'file',
			'.woff': 'file',
			'.woff2': 'file',
			'.ttf': 'file',
			'.eot': 'file'
		},
		plugins: [
			nodeBuiltinStubsPlugin,
			caseSensitivePathsPlugin,
			babelPlugin,
			stylesPlugin,
			htmlPlugin,
			ilibAssetsPlugin,
			webosMetaAssetsPlugin,
			typeCheckPlugin,
			eslintPlugin
		].filter(Boolean),
		define
	};
};