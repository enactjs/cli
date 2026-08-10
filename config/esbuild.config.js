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
// Node's crypto (for cache-key hashing); named to avoid shadowing the global
// WebCrypto `crypto`, which has no `createHash`.
const nodeCrypto = require('crypto');
const {spawn} = require('child_process');
const resolve = require('resolve');
const postcss = require('postcss');
const postcssModules = require('postcss-modules');
const postcssImport = require('postcss-import');
const postcssUrl = require('postcss-url');
const less = require('less');
const LessPluginNpmImport = require('less-plugin-npm-import');
const sass = require('sass');
const babel = require('@babel/core');
const getPublicUrlOrPath = require('react-dev-utils/getPublicUrlOrPath');
const {
	optionParser: app,
	cssModuleIdent: getLocalIdent,
	EsbuildHtmlPlugin,
	EsbuildILibPlugin,
	EsbuildWebOSMetaPlugin
} = require('@enact/dev-utils');

// Convert the app's resolved browserslist into esbuild `target` engine
// identifiers (e.g. ["chrome109", "safari26.5"]). This is the esbuild analog of
// webpack's `target: app.environment` (which resolves to the string
// 'browserslist' for browser apps and lets webpack read the browserslist
// config); esbuild instead wants concrete `<engine><version>` targets, so we
// resolve the list ourselves and take the minimum version per engine. Browsers
// esbuild has no engine for (samsung, and_uc, op_mini, kaios, baidu, …) are
// dropped — their modern equivalents are already covered by chrome/safari.
function esbuildTargetFromBrowserslist (context) {
	let list;
	try {
		list = require('browserslist')(null, {path: context});
	} catch (e) {
		return null;
	}
	if (!list || !list.length) return null;
	const ENGINES = {
		chrome: 'chrome',
		and_chr: 'chrome',
		edge: 'edge',
		firefox: 'firefox',
		and_ff: 'firefox',
		safari: 'safari',
		ios_saf: 'ios',
		opera: 'opera',
		op_mob: 'opera',
		ie: 'ie',
		node: 'node'
	};
	const mins = {};
	for (const entry of list) {
		const [browser, version] = entry.split(' ');
		const engine = ENGINES[browser];
		if (!engine || !version) continue;
		// Versions may be ranges ("18.5-18.7"); the lower bound is the minimum
		// the app must support. Non-numeric versions ("all", "TP") are skipped.
		const v = parseFloat(String(version).split('-')[0]);
		if (!isFinite(v)) continue;
		if (mins[engine] === undefined || v < mins[engine]) mins[engine] = v;
	}
	const targets = Object.keys(mins).map(engine => engine + mins[engine]);
	return targets.length ? targets : null;
}

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
	// esbuild emits a single CSS file per entry (it has no CSS code-splitting
	// for a non-`splitting` build), so `--split-css`/`--no-split-css` has no
	// effect here; the parameter is kept for signature parity with the webpack
	// eslint-disable-next-line no-unused-vars
	noSplitCSS = false,
	ilibAdditionalResourcesPath,
	// iLib locale filtering (webpack `-l`), threaded through to EsbuildILibPlugin.
	locales,
	outputPath
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
	// Set by the isomorphic prerender build (esbuild-isomorphic.js) when
	// compiling the server-rendered bundle: real Node builtins must resolve
	// normally (ilib's Node loader genuinely needs `fs`), unlike the browser
	// build below which stubs them out. Everything else in this factory
	// (Babel, CSS Modules/postcss pipeline) is reused unchanged, which is
	// required for the client and SSR builds to produce identical
	// CSS-module class names (both derive from the same resourcePath +
	// rootContext-based `cssModuleIdent`).
	const isSSRBuild = process.env.ENACT_ESBUILD_SSR === 'true';

	const publicPath = getPublicUrlOrPath(!isEnvProduction, app.publicUrl, process.env.PUBLIC_URL).replace(/^\/$/, '');

	// Source maps are resource heavy and can cause out of memory issue for large source files.
	// By default, sourcemaps will be used in development, however it can universally forced
	// on or off by setting the GENERATE_SOURCEMAP environment variable.
	const GENERATE_SOURCEMAP = process.env.GENERATE_SOURCEMAP || (isEnvProduction ? 'false' : 'true');
	const shouldUseSourceMap = GENERATE_SOURCEMAP !== 'false';

	// All the asset-emitting plugins (html, iLib, webOS, css `url()`) capture
	// this `outdir`, so an `-o/--output` override must flow through here — not
	// be patched onto the returned options afterward — or the bundle and its
	// sibling assets would land in different directories.
	const outdir = outputPath ? path.resolve(outputPath) : path.resolve('./dist');
	const entryNames = contentHash ? '[name].[hash]' : '[name]';
	const chunkNames = contentHash ? 'chunk.[name].[hash]' : 'chunk.[name]';
	// Flat, content-hashed asset dir (fonts/images referenced by CSS `url()` or
	// JS imports). Deliberately not `[dir]/[name]`: `[dir]` preserves the
	// source directory, which — for a symlinked theme whose files resolve
	// *above* the app context (e.g. limestone's `@enact/limestone` → repo root)
	// — escapes the output and esbuild sanitizes it to ugly `_.._/…` folders.
	// A flat `assets/` with a content hash keeps names unique regardless of
	// source location (mirroring webpack's `static/media/[name].[hash]`).
	const assetNames = 'assets/[name]-[hash]';

	const getAdditionalModulePaths = paths => {
		if (!paths) return [];
		return Array.isArray(paths) ? paths : [paths];
	};

	// ---------------------------------------------------------------------
	// Transform cache (Babel + LESS/SCSS/PostCSS).
	//
	// esbuild's dev server rebuilds on demand, and esbuild re-invokes `onLoad`
	// for every module on each rebuild — so without a cache the whole app is
	// re-transpiled per rebuild (measured: ~9s for a no-change rebuild of
	// qa-dropdown, which is what makes browser requests wait seconds). Both
	// other bundlers cache this work: webpack via `babel-loader`'s
	// `cacheDirectory`
	// Two layers: an in-memory Map (makes repeated rebuilds in one dev-server
	// process nearly free) backed by a JSON-per-entry on-disk store (makes cold
	// starts fast from the second run onward). The cache is best-effort — any
	// I/O failure silently falls through to a real transform.
	//
	// Entries are keyed by a config signature (everything that can change the
	// transform output) + the file path + its mtime/size, and carry the
	// dependency list (LESS/SCSS `@import`s, PostCSS `@import`s) so an entry is
	// invalidated when an imported file changes too.
	// ---------------------------------------------------------------------
	const sha1 = str => nodeCrypto.createHash('sha1').update(str).digest('hex');

	const transformCacheDir = path.join(app.context, 'node_modules', '.cache', 'enact-esbuild-transform');
	let transformCacheEnabled = process.env.ENACT_ESBUILD_NO_CACHE !== 'true';
	if (transformCacheEnabled) {
		try {
			fs.mkdirSync(transformCacheDir, {recursive: true});
		} catch (e) {
			transformCacheEnabled = false;
		}
	}

	// Everything that affects transform output but isn't the file itself. If any
	// of it changes, every cache key changes (so stale output can't be reused).
	const configSignature = sha1(
		JSON.stringify({
			cli: require('../package.json').version,
			env: process.env.NODE_ENV,
			production: isEnvProduction,
			sourceMap: shouldUseSourceMap,
			browserslist: process.env.BROWSERSLIST || null,
			publicPath,
			accent: app.accent || null,
			ri: app.ri,
			forceCSSModules: Boolean(app.forceCSSModules),
			tailwind: useTailwind,
			babelConfig: (() => {
				try {
					return fs.statSync(path.join(__dirname, 'babel.config.js')).mtimeMs;
				} catch (e) {
					return 0;
				}
			})()
		})
	);

	// Cheap change-detector for a file (mtime + size), used for both cache keys
	// and dependency validation.
	function fileSignature (file) {
		try {
			const st = fs.statSync(file);
			return `${st.mtimeMs}:${st.size}`;
		} catch (e) {
			return 'missing';
		}
	}

	const memCache = new Map();

	function entryValid (entry) {
		return Boolean(entry) && (entry.deps || []).every(d => fileSignature(d.file) === d.sig);
	}

	function cacheRead (key) {
		const mem = memCache.get(key);
		if (mem) {
			if (entryValid(mem)) return mem;
			memCache.delete(key);
		}
		if (!transformCacheEnabled) return null;
		try {
			const entry = JSON.parse(fs.readFileSync(path.join(transformCacheDir, key + '.json'), 'utf8'));
			if (!entryValid(entry)) return null;
			memCache.set(key, entry);
			return entry;
		} catch (e) {
			return null;
		}
	}

	function cacheWrite (key, entry, deps) {
		entry.deps = (deps || []).map(file => ({file, sig: fileSignature(file)}));
		memCache.set(key, entry);
		if (!transformCacheEnabled) return entry;
		const dest = path.join(transformCacheDir, key + '.json');
		try {
			// Write-then-rename so a concurrent reader never sees a partial file.
			const tmp = `${dest}.${process.pid}.tmp`;
			fs.writeFileSync(tmp, JSON.stringify(entry));
			fs.renameSync(tmp, dest);
		} catch (e) {
			// Best-effort; a failed write just means a miss next time.
		}
		return entry;
	}

	function cacheKey (kind, file) {
		return sha1(`${configSignature}|${kind}|${file}|${fileSignature(file)}`);
	}

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

	// Normalizes `url()` references so esbuild's CSS loader can resolve and
	// emit them (as hashed file assets, per `assetNames`/`publicPath`) — the
	// `url()` half of what css-loader/file-loader did. esbuild resolves url()s
	// against the stylesheet's own directory, so local relative/absolute paths
	// are left as-authored (LESS `rewriteUrls:'all'` has already rebased
	// imported-file urls to be correct relative to the entry). Only the `~`
	// tilde npm-package convention — which esbuild doesn't understand in CSS —
	// is rewritten, to a path relative to the stylesheet. data: URIs and
	// remote URLs are left untouched.
	function handleCssUrl (asset, dir) {
		if (/^(data:|https?:|\/\/)/.test(asset.url)) return asset.url;
		if (asset.url.startsWith('~')) {
			const resolved = resolveTildeSpecifier(asset.url, path.dirname(dir.from));
			if (resolved && fs.existsSync(resolved)) {
				const rel = path.relative(path.dirname(dir.from), resolved).replace(/\\/g, '/');
				return rel.startsWith('.') ? rel : './' + rel;
			}
		}
		return asset.url;
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
	// less-loader / sass-loader / css-loader chain). Returns `{css, deps}` —
	// `deps` are the files pulled in via `@import`, needed both to invalidate
	// the transform cache and to tell esbuild what else to watch.
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
				modifyVars: Object.assign({__DEV__: !isEnvProduction}, app.accent),
				// Rebase `url()`s from `@import`ed files to be relative to this
				// entry file. LESS's default (`off`) leaves them as authored in
				// their source file, so after the imports are inlined a
				// deep-file `url(../../fonts/x.ttf)` points at the wrong place
				// relative to the entry — and esbuild (which resolves url()s
				// against the entry's dir) can't find the asset. webpack's
				// less-loader/css-loader sidesteps this by resolving each url
				// against its authoring file; `rewriteUrls:'all'` gives esbuild
				// the same correct, entry-relative paths.
				rewriteUrls: 'all'
			});
			// `imports` is less's own list of every file it pulled in.
			return {css: result.css, deps: result.imports || []};
		}
		if (/\.s[ac]ss$/.test(filePath)) {
			const result = sass.compile(filePath, {sourceMap: shouldUseSourceMap});
			const deps = (result.loadedUrls || [])
				.filter(u => (u.protocol || '') === 'file:')
				.map(u => {
					try {
						return require('url').fileURLToPath(u);
					} catch (e) {
						return null;
					}
				})
				.filter(Boolean);
			return {css: result.css, deps};
		}
		return {css: source, deps: []};
	}

	// Files PostCSS itself pulled in (postcss-import's `@import`s), reported via
	// its standard `dependency` messages — folded into the cache/watch deps.
	function postcssDeps (result) {
		return (result.messages || [])
			.filter(m => m && (m.type === 'dependency' || m.type === 'dir-dependency') && m.file)
			.map(m => m.file);
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
			build.onLoad({filter: /.*/, namespace: 'css-module-raw'}, args => {
				const cached = cssModuleCache.get(args.path) || {css: '', deps: []};
				return {
					contents: cached.css,
					loader: 'css',
					resolveDir: path.dirname(args.path),
					// Without this, esbuild would keep reusing the CSS it cached
					// for this virtual module on every later rebuild (its id never
					// changes), so edits to the stylesheet — or to anything it
					// `@import`s — would never reach the emitted CSS. Declaring
					// the real files makes esbuild invalidate it correctly.
					watchFiles: [args.path].concat(cached.deps || [])
				};
			});

			build.onLoad({filter: /\.module\.(css|less|scss|sass)$/}, async args => {
				const key = cacheKey('css-module', args.path);
				const shim = tokensLiteral =>
					// Importing the virtual raw-css path lets esbuild bundle/
					// extract the CSS the normal way, while this JS module
					// still exports the class-name token map.
					`import ${JSON.stringify(args.path + '?css-module-raw')};\n` +
					`export default ${tokensLiteral};\n`;

				const hit = cacheRead(key);
				if (hit) {
					// The virtual `?css-module-raw` loader reads the compiled CSS
					// back out of this map, so it must be repopulated on a hit.
					cssModuleCache.set(args.path, {css: hit.css, deps: (hit.deps || []).map(d => d.file)});
					return {
						contents: shim(hit.tokens),
						loader: 'js',
						resolveDir: path.dirname(args.path),
						watchFiles: (hit.deps || []).map(d => d.file)
					};
				}

				const source = fs.readFileSync(args.path, 'utf8');
				const compiled = await compileToCss(args.path, source);

				let tokens = {};
				const result = await postcss(
					buildPostcssPlugins({
						withModules: true,
						getJSON (cssPath, json) {
							tokens = json;
						}
					})
				).process(compiled.css, {from: args.path, map: shouldUseSourceMap});

				const exportsLiteral = JSON.stringify(tokens);
				const deps = compiled.deps.concat(postcssDeps(result));
				cssModuleCache.set(args.path, {css: result.css, deps});
				cacheWrite(key, {css: result.css, tokens: exportsLiteral}, deps);

				return {
					contents: shim(exportsLiteral),
					loader: 'js',
					resolveDir: path.dirname(args.path),
					// Tell esbuild to watch the `@import`ed files too, so editing
					// a shared LESS partial triggers a rebuild (esbuild only
					// tracks what it resolves itself, and these are inlined by
					// less/sass before esbuild ever sees them).
					watchFiles: deps
				};
			});

			// Go's regexp engine (used by esbuild's onLoad filters) doesn't
			// support lookbehind, so this can't exclude `.module.*` files by
			// pattern. It doesn't need to: esbuild only invokes the first
			// registered onLoad whose filter matches a given file, and the
			// `.module.(css|less|scss|sass)` handler above is registered
			// first, so `.module.*` files never reach this one.
			build.onLoad({filter: /\.(css|less|scss|sass)$/}, async args => {
				const key = cacheKey('css', args.path);
				const hit = cacheRead(key);
				if (hit) {
					return {
						contents: hit.css,
						loader: 'css',
						resolveDir: path.dirname(args.path),
						watchFiles: (hit.deps || []).map(d => d.file)
					};
				}

				const source = fs.readFileSync(args.path, 'utf8');
				const compiled = await compileToCss(args.path, source);
				const result = await postcss(
					buildPostcssPlugins({
						// `app.forceCSSModules` mirrors the original `icss`/getLocalIdent
						// toggle for non-`.module.` stylesheets.
						withModules: Boolean(app.forceCSSModules),
						getJSON () {}
					})
				).process(compiled.css, {from: args.path, map: shouldUseSourceMap});

				const deps = compiled.deps.concat(postcssDeps(result));
				cacheWrite(key, {css: result.css}, deps);

				return {
					contents: result.css,
					loader: 'css',
					resolveDir: path.dirname(args.path),
					watchFiles: deps
				};
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
				// Babel dominates build time (it runs over all app code *and*
				// @enact's raw source), and esbuild re-invokes onLoad on every
				// rebuild — so serve the transpiled output from cache whenever
				// the file is unchanged. Mirrors babel-loader's `cacheDirectory`.
				const key = cacheKey('babel', args.path);
				const hit = cacheRead(key);
				if (hit) {
					return {contents: hit.code, loader: 'js', resolveDir: path.dirname(args.path)};
				}
				const result = babel.transformFileSync(args.path, {
					configFile: path.join(__dirname, 'babel.config.js'),
					babelrc: false,
					sourceMaps: shouldUseSourceMap,
					compact: isEnvProduction
				});
				cacheWrite(key, {code: result.code}, [args.path]);
				return {contents: result.code, loader: 'js', resolveDir: path.dirname(args.path)};
			});
		}
	};

	// HTML document (HtmlWebpackPlugin equivalent), iLib runtime + locale data
	// (ILibPlugin), and webOS metadata (WebOSMetaPlugin) are provided by the
	// dev-utils esbuild plugins, instantiated near the return below

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
			// an empty stub when it's available. Not needed for SSR builds —
			// real Node `util` is available natively.
			if (!isSSRBuild) {
				build.onResolve({filter: /^util$/}, () => {
					try {
						return {path: require.resolve('util/')};
					} catch (e) {
						return {path: 'util', namespace: 'enact-empty-stub'};
					}
				});
			}

			// Everything else that's a genuine Node builtin (fs, child_process,
			// net, etc.) has no meaningful browser equivalent for this app;
			// resolve to an empty module rather than failing the bundle. Skip
			// this for SSR builds — esbuild's `platform: 'node'` already
			// externalizes real builtins automatically, and ilib's Node
			// locale loader genuinely needs a working `fs`.
			if (!isSSRBuild) {
				const nodeBuiltins = new Set(require('module').builtinModules);
				build.onResolve({filter: /.*/}, args => {
					if (nodeBuiltins.has(args.path) && args.path !== 'util') {
						return {path: args.path, namespace: 'enact-empty-stub'};
					}
					return null;
				});
			}

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
	// esbuild plugin: `resolve.roots`. Webpack's `resolve.roots` defaults to
	// `[context]`, so a server-absolute import like `/assets/images/x.jpg`
	// resolves against the app root rather than the real filesystem root
	// esbuild has no equivalent, so redirect a leading-slash request to the app
	// context when the literal path doesn't exist on disk but the
	// context-relative one does.
	// ---------------------------------------------------------------------
	const resolveRootsPlugin = {
		name: 'enact-resolve-roots',
		setup (build) {
			build.onResolve({filter: /^\/[^/]/}, args => {
				if (fs.existsSync(args.path)) return null; // genuine absolute path
				const candidate = path.join(app.context, args.path);
				if (fs.existsSync(candidate)) return {path: candidate};
				return null;
			});
		}
	};

	// ---------------------------------------------------------------------
	// esbuild plugin: `asset/resource` catch-all. Webpack's final module rule
	// emits *any* import that isn't js/jsx/ts/tsx/html/ejs/json (and isn't a
	// stylesheet handled earlier) as a file asset — subtitles (`.vtt`), video,
	// audio, PDFs, etc. esbuild errors on any extension missing from its
	// `loader` map, so this fallback emits the file (loader `file`) for any
	// extension not already handled by babel, the styles plugin, the explicit
	// `loader` map, or esbuild's own json/text builtins. Registered last so the
	// specific onLoad handlers above win first.
	// ---------------------------------------------------------------------
	const HANDLED_EXT_RE = /\.(js|mjs|cjs|jsx|ts|tsx|css|less|scss|sass|json|html|ejs)$/i;
	const assetResourcePlugin = {
		name: 'enact-asset-resource',
		setup (build) {
			build.onLoad({filter: /.*/}, args => {
				const ext = path.extname(args.path).toLowerCase();
				// Extensionless, code, or style files are handled elsewhere /
				// by esbuild's own default loaders.
				if (!ext || HANDLED_EXT_RE.test(args.path)) return null;
				// Explicit `loader` map entries (png/jpg/fonts/…) already emit
				// these; let esbuild use the configured loader.
				const configured = build.initialOptions.loader || {};
				if (configured[ext]) return null;
				return {contents: fs.readFileSync(args.path), loader: 'file'};
			});
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
			// onStart, not onEnd: the lint is a separate child process, so kicking
			// it off as the build begins lets it run fully in parallel with the
			// bundling. Started at onEnd it serialized *after* the build — and
			// because the child handle keeps the event loop alive, `pack` didn't
			// exit until the lint finished, adding its whole runtime to the wall
			// clock. (Mirrors the same fix on the Vite path, where lint now runs
			// concurrently and is awaited at closeBundle.)
			build.onStart(() => {
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

	// iLib runtime + locale data, webOS metadata, and the HTML document are
	// provided by the dev-utils esbuild plugins, instantiated below (after the
	// `define` block, since the iLib plugin contributes the `ILIB_*` defines).

	// Browser-only webOS features (iLib data + webOS metadata), matching the
	// webpack paths — non-browser targets don't emit these.
	const isBrowserTarget = !['node', 'async-node', 'webworker'].includes(app.environment);

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

	// iLib runtime (ILibPlugin equivalent): the plugin computes the `ILIB_*`
	// define constants and, on build, copies the iLib locale + app/theme
	// `resources` data into the output (trimmed to `-l` locales when given).
	// Browser targets only;
	const ilib =
		isBrowserTarget &&
		EsbuildILibPlugin({
			context: app.context,
			publicPath: app.publicUrl || '/',
			ilibAdditionalResourcesPath,
			locales,
			emit: true
		});
	if (ilib) Object.assign(define, ilib.define);

	// webOS metadata (WebOSMetaPlugin equivalent) + HTML document
	// (HtmlWebpackPlugin equivalent). webOS meta is browser-only; the HTML title
	// falls back to the webOS appinfo title, matching the webpack paths.
	const webosMeta = isBrowserTarget && EsbuildWebOSMetaPlugin({context: app.context, publicPath: app.publicUrl || '/'});
	const html = EsbuildHtmlPlugin({
		title: app.title || (isBrowserTarget && EsbuildWebOSMetaPlugin.readTitle(app.context)) || '',
		template: app.template || path.join(__dirname, 'html-template.ejs'),
		publicPath,
		production: isEnvProduction,
		// The esbuild dev server (`enact serve --esbuild`) sets this marker; the
		// emitted index.html then carries esbuild's `/esbuild` live-reload
		// listener, so esbuild.serve() can serve it directly with no HTML rewrite.
		liveReload: process.env.ENACT_ESBUILD_SERVE === 'true'
	});

	// Pinning react/react-dom/react-is to one resolved path (rather than
	// letting each importer resolve its own nearest copy) is what webpack's
	// `resolve.modules` list (app's own node_modules checked first, for every
	// resolution) used to guarantee for free; without it, packages under
	// @enact/* can bundle a different nested copy of react than the app uses
	// ("Invalid hook call" / duplicate-React errors, or — for react-is version
	// skew against React 19's element Symbol — a flood of "expected a ReactNode"
	// prop-type warnings). Resolve each from the app first (webpack's
	// resolve.modules puts the app first), then fall back to the CLI's own copy
	// so shared singletons like `react-is` still dedupe when the app has no
	// directly-resolvable copy — e.g. theme samples whose only react-is lives
	// nested under @enact/*'s prop-types. This mirrors webpack.config.js, which
	// pins react-is via `require.resolve('react-is/package.json')` (the CLI's).
	// Still tolerant: a package resolvable from neither place is simply skipped.
	const resolveAliasDir = request => {
		try {
			return path.dirname(resolve.sync(request, {basedir: app.context}));
		} catch (e) {
			try {
				return path.dirname(require.resolve(request));
			} catch (e2) {
				return null;
			}
		}
	};
	// Beyond the React singletons, the Enact stack ships a copy of a few shared
	// utility libraries inside *each* `@enact/*` package. esbuild resolves each
	// importer's nearest copy, so they get bundled once per importer (measured
	// on qa-a11y: ramda alone was +39 KB across 4 copies). They are pinned to
	// the same version throughout the stack (ramda 0.32.0, classnames 2.5.1,
	// warning 4.0.3, invariant 2.2.4 — all `^`-compatible), so collapsing them
	// to one copy is safe and mirrors what webpack's `resolve.modules` ordering
	// does. Anything that fails to resolve is simply left alone.
	const reactAliases = {};
	['react', 'react-dom', 'react-is', 'prop-types', 'ramda', 'classnames', 'warning', 'invariant'].forEach(pkg => {
		const dir = resolveAliasDir(`${pkg}/package.json`);
		if (dir) reactAliases[pkg] = dir;
	});

	// iLib is shipped both as a top-level `ilib` package and nested under
	// `@enact/i18n/ilib`, and individual `@enact/*` packages carry their own
	// copies. Because esbuild resolves each importer's nearest copy, a bare
	// `ilib` request from `@enact/i18n` and one from the app resolve to two
	// different directories and iLib gets bundled twice (measured: +69 KB on
	// qa-a11y). Pin every spelling to one directory so it is bundled once — the
	// same dedupe webpack gets from `resolve.modules` listing the app's
	// node_modules first. If neither resolves, keep the historical
	// name-to-name alias, which preserves the old backward-compat mapping.
	const ilibDir = resolveAliasDir('ilib/package.json') || resolveAliasDir('@enact/i18n/ilib/package.json');
	const ilibAliases = ilibDir ?
		{ilib: ilibDir, '@enact/i18n/ilib': ilibDir} :
		fs.existsSync(path.join(app.context, 'node_modules', '@enact', 'i18n', 'ilib')) ?
			{ilib: '@enact/i18n/ilib'} :
			{'@enact/i18n/ilib': 'ilib'};

	// ---------------------------------------------------------------------
	// Optional Terser pass (ENACT_ESBUILD_MINIFY=terser, production only): the
	// bundle is built unminified (see `minify` below), then each emitted .js is
	// run through Terser with the same options the webpack path uses, and each
	// .css through esbuild's CSS minifier (which `minify:false` also disabled).
	// Runs once per process — `pack` is one-shot, and the dev server never sets
	// production mode.
	const useTerser = isEnvProduction && process.env.ENACT_ESBUILD_MINIFY === 'terser';
	const terserPlugin = useTerser && {
		name: 'enact-terser',
		setup (build) {
			build.initialOptions.metafile = true;
			let minified = false;
			build.onEnd(async result => {
				if (minified || !result.metafile) return;
				minified = true;
				const terser = require('terser');
				const esb = require('esbuild');
				for (const f of Object.keys(result.metafile.outputs)) {
					if (/\.map$/.test(f)) continue;
					const abs = path.resolve(f);
					if (/\.js$/.test(f)) {
						const out = await terser.minify(fs.readFileSync(abs, 'utf8'), {
							mangle: {safari10: true},
							compress: {ecma: 5, comparisons: false, inline: 2},
							format: {comments: false, ascii_only: true}
						});
						if (out.code) fs.writeFileSync(abs, out.code);
					} else if (/\.css$/.test(f)) {
						const out = await esb.transform(fs.readFileSync(abs, 'utf8'), {loader: 'css', minify: true});
						if (out.code) fs.writeFileSync(abs, out.code);
					}
				}
			});
		}
	};

	// SSR builds write to their own directory — never the app's real output
	// dir — since they use the same entryNames/chunkNames patterns as the
	// client build and would otherwise silently overwrite the browser
	// bundle with the Node/CJS one (or vice versa, depending on build order).
	const ssrOutdir = path.join(outdir, '.ssr');

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
		outdir: isSSRBuild ? ssrOutdir : outdir,
		entryNames,
		chunkNames,
		assetNames,
		publicPath,
		platform: isSSRBuild ? 'node' : 'browser',
		// Critical for SSR: react/react-dom must NOT be bundled into the SSR
		// output. esbuild-isomorphic.js loads react-dom/server separately
		// (via require.resolve against the app's own node_modules) to call
		// renderToString — if the SSR bundle also bundled its own private
		// copy of react/react-dom, the two would be different module
		// instances with separate internal hook-dispatcher state, causing
		// "Cannot read properties of null (reading 'useEffect')" the moment
		// any component uses a hook. Marking them external instead leaves
		// `require('react')` etc. as plain runtime requires, so both sides
		// resolve to the exact same module instance.
		external: isSSRBuild ? ['react', 'react-dom', 'react-dom/*'] : undefined,
		// SSR output must be CJS: ilib's Node locale loader has leftover
		// `require()` calls, and the prerender step loads this bundle with
		// `require()` itself (an ESM/.mjs bundle would throw `require is not
		// defined`) — matching the reasoning the Vite isomorphic path uses
		// for its own SSR build.
		format: isSSRBuild ? 'cjs' : undefined,
		// Target the app's browserslist (esbuild's analog of webpack's
		// `target: app.environment`), converted to esbuild engine identifiers.
		// Falls back to a modern baseline if the list resolves to no
		// esbuild-known engine. (`app.setEnactTargetsAsDefault()` above has
		// already seeded the Enact default browserslist when the app has none.)
		// SSR builds target the Node runtime instead, since that's what
		// actually executes this bundle.
		target: isSSRBuild ? 'node18' : esbuildTargetFromBrowserslist(app.context) || 'es2019',
		// esbuild's native minifier is the default: equal to Terser on raw bytes
		// and essentially free. ENACT_ESBUILD_MINIFY=terser opts into a Terser
		// pass instead (JS built unminified here, then minified by the
		// enact-terser plugin below; CSS is minified separately) — measured on
		// qa-a11y it recovers ~32 KB gzip (370 -> 338 KB) for a few seconds of
		// build time, the inverse of the Vite path's ENACT_VITE_MINIFY=esbuild.
		// SSR builds skip minification entirely — it's a throwaway Node
		// bundle used only to render HTML strings during the build, never
		// shipped.
		minify: !isSSRBuild && isEnvProduction && process.env.ENACT_ESBUILD_MINIFY !== 'terser',
		sourcemap: !isSSRBuild && shouldUseSourceMap ? (isEnvProduction ? true : 'linked') : false,
		logLevel: 'info',
		metafile: true,
		absWorkingDir: app.context,
		// NodePolyfillPlugin equivalent: esbuild does not auto-polyfill node
		// builtins for the browser platform the way webpack 4 used to.
		// `alias` below only remaps bare imports of these names; it does not
		// polyfill globals like `process`/`Buffer` referenced without an
		// import. Add real shims via `inject` if your app relies on those.
		alias: isSSRBuild ? app.alias || {} : Object.assign(reactAliases, ilibAliases, app.alias),
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
			resolveRootsPlugin,
			caseSensitivePathsPlugin,
			babelPlugin,
			stylesPlugin,
			// dev-utils esbuild plugins (webOS features) — only the client
			// build should emit index.html/ilib locale data/appinfo.json;
			// the SSR build is a throwaway Node bundle for rendering only.
			!isSSRBuild && html,
			!isSSRBuild && ilib && ilib.plugin,
			!isSSRBuild && webosMeta,
			// Type-checking/linting already ran once against the client
			// build; no need to duplicate against the SSR build of the same
			// source.
			!isSSRBuild && typeCheckPlugin,
			!isSSRBuild && eslintPlugin,
			assetResourcePlugin,
			!isSSRBuild && terserPlugin
		].filter(Boolean),
		define
	};
};