/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */

/**
 * Experimental Vite configuration for @enact/cli.
 *
 * This is a vite equivalent of `webpack.config.js`. It mirrors the same
 * factory signature so the `pack`/`serve` commands can build an equivalent
 * config, and it reuses the existing Enact tooling wherever a webpack-agnostic
 * equivalent exists:
 *   - `@enact/dev-utils` optionParser    -> app options (ri, accent, alias, ...)
 *   - `@enact/dev-utils` ViteHtmlPlugin  -> HTML document (webpack: HtmlWebpackPlugin)
 *   - `@enact/dev-utils` ViteILibPlugin  -> iLib i18n runtime + locale filtering (webpack: ILibPlugin)
 *   - `@enact/dev-utils` ViteWebOSMetaPlugin -> appinfo.json + assets (webpack: WebOSMetaPlugin)
 *   - `babel-preset-enact`               -> via @vitejs/plugin-react `babel`
 *   - PostCSS resolution-independence    -> via `css.postcss.plugins`
 *   - LESS accent/skin modifyVars        -> via `css.preprocessorOptions.less`
 *   - cssModuleIdent (getLocalIdent)     -> via `css.modules.generateScopedName`
 *   - eslint-config-enact                -> via the inline `enact-eslint` plugin
 *
 */

const fs = require('fs');
const path = require('path');
const {
	optionParser: app,
	cssModuleIdent: getLocalIdent,
	ViteHtmlPlugin,
	ViteILibPlugin,
	ViteWebOSMetaPlugin
} = require('@enact/dev-utils');

const {nodePolyfills} = require('vite-plugin-node-polyfills');

// PostCSS plugin chain, shared with webpack.config.js.
const {getPostCssPlugins} = require('./postcss-plugins');

// Vite plugin that runs ESLint against the app sources, mirroring the webpack
// build's `eslint-webpack-plugin` (same flat config in eslintWebpackPluginConfig).
function enactEslintPlugin () {
	let isBuild = true;
	return {
		name: 'enact-eslint',
		configResolved (resolved) {
			isBuild = resolved.command === 'build';
		},
		async buildStart () {
			let ESLint;
			try {
				({ESLint} = require('eslint'));
			} catch (e) {
				return; // eslint not available; skip silently
			}
			const eslint = new ESLint({
				cwd: app.context,
				overrideConfigFile: require.resolve('./eslintWebpackPluginConfig'),
				errorOnUnmatchedPattern: false,
				cache: true,
				cacheLocation: path.resolve('./node_modules/.cache/.eslintcache-vite')
			});
			const results = await eslint.lintFiles(['src/**/*.{js,mjs,jsx,ts,tsx}']);
			const errorCount = results.reduce((n, r) => n + r.errorCount, 0);
			const warningCount = results.reduce((n, r) => n + r.warningCount, 0);
			if (errorCount || warningCount) {
				const formatter = await eslint.loadFormatter('stylish');
				const output = formatter.format(results);
				if (output) console.log(output);
			}
			// Match webpack: errors fail the build; the dev server only warns.
			if (isBuild && errorCount > 0) {
				this.error(`ESLint found ${errorCount} error(s).`);
			}
		}
	};
}

// Vite plugin that neutralizes webpack's HMR API in-app source. Some Enact apps
// guard reducer/hot-reload code with `if (module.hot) { module.hot.accept(…) }`.
// `module` exists in the webpack runtime but not in Vite's browser ESM (the app source
// isn't CJS-wrapped like pre-bundled deps), so it throws `module is not defined`.
// Vite's `define` can't replace `module.hot` (esbuild treats `module` specially),
// so rewrite it to `false` here. The webpack-only block is skipped, and Vite's own
// HMR (import.meta.hot) still applies to the module graph.
function enactNeutralizeWebpackHmrPlugin () {
	return {
		name: 'enact-neutralize-webpack-hmr',
		enforce: 'pre',
		transform (code, id) {
			const file = id.split('?')[0];
			if (file.includes('/node_modules/') || !/\.(?:jsx?|tsx?|mjs)$/.test(file)) return null;
			if (!code.includes('module.hot')) return null;
			return {code: code.replace(/\bmodule\.hot\b/g, 'false'), map: null};
		}
	};
}

// vite-plugin-node-polyfills injects bare imports of its own shims and
// `node-stdlib-browser` into app modules. Those packages live in the CLI's
// node_modules, not the app's, so an app built with `root: app.context` (e.g. a
// sample under a theme repo) can't resolve them. We need to resolve those specifiers from the
// CLI instead; their transitive deps then resolve from the CLI tree naturally.
function enactNodePolyfillResolverPlugin () {
	const FROM_CLI = /^(?:vite-plugin-node-polyfills|node-stdlib-browser)(?:\/|$)/;
	return {
		name: 'enact-node-polyfill-resolver',
		enforce: 'pre',
		resolveId (source) {
			if (!FROM_CLI.test(source)) return null;
			try {
				return require.resolve(source);
			} catch (e) {
				return null;
			}
		}
	};
}

// Webpack parity for `resolve.modules: [path.resolve('./node_modules'), 'node_modules']`:
// webpack adds the APP-ROOT node_modules as a global resolution root, so a bare specifier
// imported from ANY file in the graph resolves there — even source pulled in from a
// sibling directory outside the app root (e.g. the `all-samples` aggregate imports
// `../../../pattern-locale-switching/src/main`, whose code does `import {Provider} from
// 'react-redux'`; `react-redux` is a dep of all-samples, not of the sibling). Vite/Rollup
// only walk up from the importing file, so such a sibling's bare deps go unresolved. This
// plugin restores the app-root fallback: when normal resolution fails for a bare specifier,
// retry from `<app root>/node_modules`.
function enactAppModulesResolverPlugin (appContext) {
	const appModules = path.join(appContext, 'node_modules');
	return {
		name: 'enact-app-modules-resolver',
		async resolveId (source, importer, options) {
			// Only bare specifiers; skip relative/absolute/virtual ids and entries.
			if (!importer || /^[./]/.test(source) || source.startsWith('\0') || path.isAbsolute(source)) {
				return null;
			}
			// Act only as a fallback: let the normal pipeline resolve first.
			const resolved = await this.resolve(source, importer, {...options, skipSelf: true});
			if (resolved) return resolved;
			try {
				return require.resolve(source, {paths: [appModules]});
			} catch (e) {
				return null;
			}
		}
	};
}

const FORCE_CSS_STYLE_RE = /\.(?:css|less|s[ac]ss)(?:\?.*)?$/;
const FORCE_CSS_MODULE_RE = /\.module\.(?:css|less|s[ac]ss)(?:\?.*)?$/;

// The Enact `forceCSSModules` build option makes ALL css/less/scss behave as CSS
// modules (scoped), not just `*.module.*`, matching the webpack build, whose
// non-module style rules use `modules:{getLocalIdent}` (no `mode:'icss'`) when the
// option is set. Vite decides module-ness purely from the `.module.` filename infix
// (cssModuleRE) with no override hook, so we resolve each non-module style import and
// redirect it to a virtual id that carries a `.module` infix. The virtual id keeps the
// real directory (so LESS `@import`/`url()` still resolve) and `load` serves the real
// file's contents. `virtualToReal` also lets `generateScopedName` recover the real
// path for the ident hash (webpack parity); genuine `*.module.*` files are untouched.
function enactForceCSSModulesPlugin (virtualToReal) {
	return {
		name: 'enact-force-css-modules',
		enforce: 'pre',
		async resolveId (source, importer, options) {
			if (!FORCE_CSS_STYLE_RE.test(source) || FORCE_CSS_MODULE_RE.test(source)) return null;
			const resolved = await this.resolve(source, importer, {...options, skipSelf: true});
			if (!resolved || resolved.external || FORCE_CSS_MODULE_RE.test(resolved.id)) return resolved;
			// Inject `.module` before the extension, preserving the directory + any query.
			const virtual = resolved.id.replace(/(\.(?:css|less|s[ac]ss))(\?.*)?$/, '.module$1$2');
			virtualToReal.set(virtual.split('?')[0], resolved.id.split('?')[0]);
			return Object.assign({}, resolved, {id: virtual});
		},
		load (id) {
			const real = virtualToReal.get(id.split('?')[0]);
			if (!real) return null;
			// Watch the real file so edits invalidate the virtual module (dev HMR).
			this.addWatchFile(real);
			return fs.readFileSync(real, 'utf8');
		}
	};
}

// True for a style file that Vite will NOT treat as a CSS module: a css/less/scss
// without the `.module.` infix, imported normally (not `?raw`/`?url`/`?inline`, which
// Vite already gives a default export of their own).
function isPlainStyleId (id) {
	const [file, query = ''] = String(id).split('?');
	if (!FORCE_CSS_STYLE_RE.test(file) || FORCE_CSS_MODULE_RE.test(file)) return false;
	return !/(?:^|&)(?:raw|url|inline)(?:&|=|$)/.test(query);
}

// ICSS interop for non-`*.module.*` CSS — the webpack `modules:{mode:'icss'}` behaviour.
// Enact apps conventionally do `import css from './App.less'` on a PLAIN (non-module)
// stylesheet and hand the map to `kind({styles:{css, className:'app'}})`. Under webpack,
// css-loader in `icss` mode leaves the class names global but still emits a default
// export (the ICSS `:export` locals, usually `{}`), so the import resolves and
// `classnames/bind` falls back to the literal global class name. Vite emits no default
// export for plain CSS at build time, so the same import is a hard error:
//   "default" is not exported by "src/App/App.less"
// These two plugins restore parity WITHOUT scoping anything (scoping stays webpack-
// identical: plain CSS remains global; only `forceCSSModules` scopes it):
//   1. `enact-icss-extract` (normal order → runs after vite: css has compiled LESS/SCSS
//      to CSS, before vite:css-post builds the JS proxy): lifts `:export {…}` blocks out
//      of the compiled CSS into a locals map, and strips them from the emitted CSS
//      (css-loader does the same; `:export` is not valid CSS for a browser).
//   2. `enact-icss-default-export` (post order → runs after vite:css-post): appends
//      `export default <locals>` when the proxy has none. Anything that already has a
//      default export (dev's CSS-string proxy, `?inline`, `?url`, `?raw`) is left alone.
function enactICSSInteropPlugins () {
	const icssExports = new Map();
	const key = id => String(id).split('?')[0];
	return [
		{
			name: 'enact-icss-extract',
			transform (code, id) {
				if (!isPlainStyleId(id)) return null;
				const locals = {};
				const stripped = code.replace(/:export\s*\{([^}]*)\}/g, (match, body) => {
					body.split(';').forEach(decl => {
						const at = decl.indexOf(':');
						if (at === -1) return;
						const name = decl.slice(0, at).trim();
						if (name) locals[name] = decl.slice(at + 1).trim();
					});
					return '';
				});
				icssExports.set(key(id), locals);
				return stripped === code ? null : {code: stripped, map: {mappings: ''}};
			}
		},
		{
			name: 'enact-icss-default-export',
			enforce: 'post',
			transform (code, id) {
				if (!isPlainStyleId(id) || /(?:^|[;\s])export\s+default\s/.test(code)) return null;
				const locals = icssExports.get(key(id)) || {};
				return {code: code + '\nexport default ' + JSON.stringify(locals) + ';\n', map: {mappings: ''}};
			}
		}
	];
}

// Non-browser iLib platform loaders (`./lib/ilib-qt|rhino|ringo|node|….js`) and
// their `*Loader.js` helpers. iLib selects these via runtime platform detection;
// the browser branch never reaches them, but bundlers try (and fail) to resolve
// them statically. Webpack sidestepped this with ILibPlugin + WebpackLoader; here
// we neutralize them in both engines (Rollup build + esbuild dev optimizer).
const ILIB_LOADER_RE = /(?:[/\\]|^\.\/lib\/)ilib-[\w-]+\.js$|(?:Node|Rhino|Qt|Ringo)Loader(?:\.js)?$/;

// Catch-all `assetsInclude` regex mirroring webpack's `asset/resource` fallthrough:
// any file whose extension is NOT code (js/ts/jsx…), markup (html/ejs), JSON, a
// stylesheet, or wasm/sourcemap is emitted as a file asset, so `import cfg from
// './analytics.cfg'` resolves to the emitted file's URL instead of Rollup trying to
// parse the file as JavaScript.
const ASSET_CATCHALL_RE = /\.(?!(?:m?[jt]sx?|c[jt]s|json5?|html?|ejs|css|less|s[ac]ss|styl|wasm|map)$)[a-z0-9_-]+$/i;

// esbuild plugin (dev dependency optimizer) that stubs the iLib loaders to empty.
const ilibStubEsbuildPlugin = {
	name: 'enact-ilib-loader-stub',
	setup (build) {
		build.onResolve({filter: ILIB_LOADER_RE}, args => ({path: args.path, namespace: 'enact-ilib-stub'}));
		build.onLoad({filter: /.*/, namespace: 'enact-ilib-stub'}, () => ({contents: 'module.exports = {};', loader: 'js'}));
	}
};

// esbuild plugin (dev dependency optimizer) that runs babel-preset-enact on
// `@enact/*` source. @enact packages ship raw, unbuilt source as their `main`
// (JSX-in-.js, decorators, and proposals like `export default from 'ilib'`) that
// esbuild's optimizer cannot parse. The Rollup build transforms them via
// @vitejs/plugin-react; this does the equivalent for pre-bundling. ESM is
// preserved (caller.supportsStaticESM) so esbuild can still bundle/tree-shake.
const enactBabelEsbuildPlugin = {
	name: 'enact-babel-optimize',
	setup (build) {
		let babel;
		const preset = require.resolve('babel-preset-enact');
		build.onLoad({filter: /[\\/]@enact[\\/].*\.(?:jsx?|mjs)$/}, async args => {
			// iLib data/loaders under @enact/i18n are not Enact source. Leave them
			// to esbuild (and the loader stub) rather than paying babel on big files.
			if (/[\\/]ilib[\\/]/.test(args.path)) return null;
			babel = babel || require('@babel/core');
			const source = fs.readFileSync(args.path, 'utf8');
			const result = await babel.transformAsync(source, {
				babelrc: false,
				configFile: false,
				filename: args.path,
				caller: {name: 'vite-optimize', supportsStaticESM: true, supportsDynamicImport: true},
				presets: [preset]
			});
			return {contents: result.code, loader: 'js'};
		});
	}
};

// LESS `~specifier` imports (e.g. `@import '~@enact/ui/styles/core.less'`) are a
// webpack/less-loader convention that resolves the specifier from node_modules.
// Vite's LESS has no such resolver, so provide a custom Less FileManager that
// strips the `~` and resolves via Node module resolution (with sensible LESS
// extension fallbacks). Mirrors less-loader's `~` behavior.
function lessTildeImportPlugin (context) {
	return {
		install (less, pluginManager) {
			class TildeFileManager extends less.FileManager {
				supports (filename) {
					return filename.charAt(0) === '~';
				}
				supportsSync () {
					return false;
				}
				loadFile (filename, currentDirectory, options, environment) {
					const spec = filename.slice(1);
					const paths = [currentDirectory, context].filter(Boolean);
					const candidates = [spec, spec + '.less', spec + '/index.less', spec + '.css'];
					let resolved;
					for (const candidate of candidates) {
						try {
							resolved = require.resolve(candidate, {paths});
							break;
						} catch (e) {
							// try next candidate
						}
					}
					if (!resolved) {
						return Promise.reject({type: 'File', message: `'${filename}' wasn't found (tilde-resolve).`});
					}
					return super.loadFile(resolved, currentDirectory, options, environment);
				}
			}
			pluginManager.addFileManager(new TildeFileManager());
		}
	};
}

// Location of the generated combined entry, *relative to the app's
// node_modules*. Single source of truth: `createCombinedEntry` writes the file
// here, and `babelTransformFilter` below exempts this same path from the
// "skip node_modules" rule so the entry still gets transpiled (see there for
// why that matters). Keep the two derived from this constant so they can't drift.
const ENTRY_CACHE_SUBDIR = ['.cache', 'enact-vite'];

// Character class matching either path separator, for regexes built below.
const SEP = '[\\\\/]';

// `.cache[\\/]enact-vite`, with the dot escaped, for use inside a path regex.
const ENTRY_CACHE_PATTERN = ENTRY_CACHE_SUBDIR.map(seg => seg.replace(/\./g, '\\.')).join(SEP);

// Which files babel-preset-enact runs on. Mirrors webpack's
// `exclude: /node_modules.(?!@enact)/` — transpile everything except non-@enact
// node_modules — with one addition: the generated combined entry. That entry
// does `import 'core-js/stable'`, and babel-preset-enact's `useBuiltIns: 'entry'`
// is what rewrites it into just the polyfills the app's browserslist needs.
// Left excluded (it lives under node_modules) the import survives verbatim and
// Rollup pulls in the whole core-js stable set — measured on qa-a11y: 483
// core-js modules instead of webpack's 77.
const babelTransformFilter = new RegExp(`${SEP}node_modules${SEP}(?!@enact${SEP}|${ENTRY_CACHE_PATTERN}${SEP})`);

// Webpack's entry is `[polyfills, appMain]`, bundled into a single `main` chunk.
// Rollup has no array-concatenation entry, so we generate a tiny combined entry
// module (in the build cache, not the source tree) that imports each in order.
// Absolute-path targets are imported by a relative path; bare specifiers (e.g.
// `core-js/stable`) are emitted as-is so Vite resolves + pre-bundles them.
function createCombinedEntry (context, targets) {
	const dir = path.join(context, 'node_modules', ...ENTRY_CACHE_SUBDIR);
	fs.mkdirSync(dir, {recursive: true});
	const file = path.join(dir, 'index.js');
	const body =
		targets
			.map(target => {
				if (!path.isAbsolute(target)) return `import ${JSON.stringify(target)};`;
				let rel = path.relative(dir, target).replace(/\\/g, '/');
				if (!rel.startsWith('.')) rel = './' + rel;
				return `import ${JSON.stringify(rel)};`;
			})
			.join('\n') + '\n';
	fs.writeFileSync(file, body);
	return file;
}

// Mirrors the webpack.config.js factory signature, plus a trailing `locales`
// argument (Vite-specific) for iLib locale filtering (webpack threads `-l`
// through the isomorphic mixin instead).
module.exports = function (
	env,
	noLinting = false,
	contentHash = false,
	isomorphic = false,
	noAnimation = false,
	noSplitCSS = false,
	ilibAdditionalResourcesPath,
	locales
) {
	// Lazy-require so the CLI still runs without vite installed for the webpack path.
	const react = require('@vitejs/plugin-react').default || require('@vitejs/plugin-react');

	process.chdir(app.context);
	require('./dotenv').load(app.context);
	app.setEnactTargetsAsDefault();

	const useTypeScript = fs.existsSync('tsconfig.json');
	const useTailwind = fs.existsSync(path.join(app.context, 'tailwind.config.js'));

	process.env.NODE_ENV = env || process.env.NODE_ENV;
	const isEnvProduction = process.env.NODE_ENV === 'production';
	const GENERATE_SOURCEMAP = process.env.GENERATE_SOURCEMAP || (isEnvProduction ? 'false' : 'true');
	const shouldUseSourceMap = GENERATE_SOURCEMAP !== 'false';

	// Resolve the concrete app entry file (webpack resolves the package dir to its main),
	// then build a combined entry that loads core-js polyfills first, then the app.
	// The CLI's `polyfills.js`/`corejs-proxy.js` are CommonJS (`require('core-js/stable')`)
	// which the webpack build transpiles but Vite's browser ESM can't run; so we import
	// `core-js/stable` directly as an ESM bare specifier (Vite pre-bundles the CJS→ESM),
	// aliased below to the CLI's copy since apps don't depend on core-js directly.
	const appEntry = require.resolve(app.context);
	const entry = createCombinedEntry(app.context, ['core-js/stable', appEntry]);
	const coreJsDir = path.dirname(require.resolve('core-js/package.json'));

	// Maps `forceCSSModules` virtual `.module` ids back to their real style files, so
	// `generateScopedName` can hash on the real path (see enactForceCSSModulesPlugin).
	const forcedCSSVirtual = new Map();

	// Enumerate the `@enact/*` packages installed in the app so they can be deduped
	// (Vite `resolve.dedupe` takes exact names, not globs). Apps like the aggregate
	// `all-samples` import source from many sibling packages, each with its own
	// node_modules and thus its own copy of every `@enact/*` dep — deduping collapses
	// them to one copy, cutting duplicate dependency optimization and bundle bloat.
	const enactDir = path.join(app.context, 'node_modules', '@enact');
	const enactPackages = fs.existsSync(enactDir) ?
		fs
			.readdirSync(enactDir)
			.filter(name => !name.startsWith('.') && fs.statSync(path.join(enactDir, name)).isDirectory())
			.map(name => '@enact/' + name) :
		[];

	const postcssPlugins = getPostCssPlugins({useTailwind});

	// Backward-compatibility ilib alias, matching webpack.config.js.
	const ilibAlias = fs.existsSync(path.join(app.context, 'node_modules', '@enact', 'i18n', 'ilib')) ?
		{ilib: '@enact/i18n/ilib'} :
		{'@enact/i18n/ilib': 'ilib'};

	return {
		root: app.context,
		base: app.publicUrl || '/',
		mode: isEnvProduction ? 'production' : 'development',
		clearScreen: false,
		logLevel: 'warn',
		// Vite copies `<root>/public` into the build output automatically (webpack: copyPublicFolder).
		publicDir: 'public',
		// Treat unknown non-code extensions (e.g. `.cfg`) as emitted file assets, matching
		// webpack's catch-all `asset/resource` loader
		assetsInclude: ASSET_CATCHALL_RE,
		define: {
			'process.env.NODE_ENV': JSON.stringify(isEnvProduction ? 'production' : 'development'),
			'process.env.PUBLIC_URL': JSON.stringify(app.publicUrl || ''),
			// Isomorphic build selects hydrateRoot vs createRoot; animation gate.
			ENACT_PACK_ISOMORPHIC: JSON.stringify(!!isomorphic),
			ENACT_PACK_NO_ANIMATION: JSON.stringify(!!noAnimation)
		},
		resolve: {
			extensions: ['.js', '.mjs', '.jsx', '.ts', '.tsx', '.json'].filter(
				ext => useTypeScript || !ext.includes('ts')
			),
			// Array form so we can mix exact aliases with the regex `~` stripper.
			alias: [
				...Object.entries(
					Object.assign(
						{'react-is': path.dirname(require.resolve('react-is/package.json'))},
						// Resolve `core-js` (imported by the generated entry) to the CLI's copy,
						// since apps don't depend on it directly. Also dedupes @enact's core-js.
						{'core-js': coreJsDir},
						ilibAlias,
						app.alias
					)
				).map(([find, replacement]) => ({find, replacement})),
				// Strip the leading `~` from CSS `@import '~pkg'` so Vite resolves the bare
				// specifier from node_modules (LESS `~` is handled by lessTildeImportPlugin).
				{find: /^~/, replacement: ''}
			],
			// Force a single copy of React across the app and all dependencies. Without this,
			// Vite pre-bundling resolves multiple physical react copies and mixing
			// components across them triggers "Invalid hook call / more than one copy
			// of React". Webpack avoids this via single-tree resolution + exposing
			// React on global in the isomorphic path.
			dedupe: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				// Shared libraries that the Enact stack ships a copy of inside *each*
				// `@enact/*` package, plus iLib (which exists both top-level and nested
				// under `@enact/i18n/ilib`). Without deduping, each importer pulls in its
				// own copy: measured on qa-a11y, 22 redundant iLib modules and 12
				// prop-types ones. They are pinned to identical versions across the stack
				// (ramda 0.32.0, classnames 2.5.1, warning 4.0.3, invariant 2.2.4), so
				// collapsing them to one copy is safe.
				'ilib',
				'ramda',
				'prop-types',
				'classnames',
				'warning',
				'invariant',
				...enactPackages
			],
			// Don't follow symlinks to their real paths (matches webpack `symlinks: false`).
			preserveSymlinks: true
		},
		css: {
			devSourcemap: shouldUseSourceMap,
			postcss: {plugins: postcssPlugins},
			// Vite treats *.module.* as CSS modules automatically. We only override the
			// scoped-name generation to match the webpack cssModuleIdent output.
			// cssModuleIdent expects a webpack-style loader context with `resourcePath`
			// and `rootContext` (used for the ident hash); `localIdentName` is ignored.
			// The result is sanitized to a valid CSS identifier: for nested @enact deps
			// (e.g. @enact/limestone/node_modules/@enact/ui/…) the derived name embeds a
			// literal `@`, which is invalid unescaped in a class selector. The trailing
			// hash keeps names unique, so collapsing invalid chars to `_` is safe.
			modules: {
				generateScopedName (name, filename) {
					// For `forceCSSModules` virtual ids, hash on the real path (webpack parity);
					// genuine `*.module.*` files pass through unchanged.
					const resourcePath = forcedCSSVirtual.get(filename.split('?')[0]) || filename;
					const ident = getLocalIdent({resourcePath, rootContext: app.context}, null, name);
					return ident.replace(/[^a-zA-Z0-9_-]/g, '_');
				}
			},
			preprocessorOptions: {
				less: {
					// Inject accent/skin vars and the __DEV__ flag, matching less-loader modifyVars.
					modifyVars: Object.assign({__DEV__: !isEnvProduction}, app.accent),
					javascriptEnabled: true,
					// Resolve `~pkg` LESS imports from node_modules (webpack/less-loader behavior).
					plugins: [lessTildeImportPlugin(app.context)]
				}
			}
		},
		build: {
			outDir: path.resolve('./dist'),
			emptyOutDir: true,
			sourcemap: shouldUseSourceMap,
			minify: isEnvProduction ? 'terser' : false,
			cssMinify: isEnvProduction,
			// Preserve webpack-style split behaviour: single main CSS when --no-split-css.
			cssCodeSplit: !noSplitCSS,
			commonjsOptions: {
				// Enact deps (notably iLib) mix ESM/CJS and use runtime platform detection
				// that require()s Node/Qt/Rhino-only loaders. Those branches never execute
				// in the browser, so ignore them at bundle time instead of failing to
				// resolve. (Webpack handled iLib via ILibPlugin + WebpackLoader + node
				// polyfills; a proper Vite ILib plugin is the real fix — see docs.)
				transformMixedEsModules: true,
				ignoreDynamicRequires: true,
				ignore: id => ILIB_LOADER_RE.test(id)
			},
			rollupOptions: {
				// Named `main` so output is `main.js`, matching the webpack bundle name.
				input: {main: entry},
				output: {
					entryFileNames: contentHash ? '[name].[hash].js' : '[name].js',
					chunkFileNames: contentHash ? 'chunk.[name].[hash].js' : 'chunk.[name].js',
					assetFileNames: contentHash ? '[name].[hash][extname]' : '[name][extname]'
				}
			}
		},
		esbuild: {
			legalComments: 'none'
		},
		optimizeDeps: {
			// Enact apps ship no `index.html`, so Vite's dependency scanner has no
			// default entry to crawl and would otherwise discover every dependency
			// lazily on the first request, each new one triggering a re-optimize +
			// full page reload. That churns badly for apps that import source from
			// sibling packages (e.g. `all-samples`). Point the scanner at the app
			// entry so it crawls the whole import graph (including cross-package
			// imports) and pre-bundles everything in one pass.
			entries: [path.relative(app.context, appEntry).replace(/\\/g, '/')],
			// The dev-server dependency scanner/optimizer is esbuild-based and defaults
			// the `.js` loader to `js`; Enact authors JSX inside plain `.js` files, which
			// breaks the scan without this. (Request-time transforms go through
			// @vitejs/plugin-react's babel, which already handles JSX-in-.js.)
			esbuildOptions: {
				loader: {'.js': 'jsx'},
				// Order matters: stub iLib loaders first, then babel-transform @enact source.
				plugins: [ilibStubEsbuildPlugin, enactBabelEsbuildPlugin]
			}
		},
		server: {
			host: process.env.HOST || '0.0.0.0',
			port: parseInt(process.env.PORT || 8080),
			hmr: true,
			fs: {
				// Enact apps can import source/assets from sibling package directories
				// outside the app root (e.g. the aggregate `all-samples` pulls views and
				// fonts from neighbouring sample packages). Vite's default fs allow-list
				// (the workspace root) blocks those with "outside of Vite serving allow
				// list". Disable the restriction so the dev server serves any imported
				// file, matching webpack-dev-server's behaviour.
				strict: false
			}
		},
		plugins: [
			// Rewrite webpack's `module.hot` in app source before other transforms.
			enactNeutralizeWebpackHmrPlugin(),
			// Webpack `resolve.modules` parity: resolve bare specifiers from the app-root
			// node_modules when they can't be resolved from the importer
			enactAppModulesResolverPlugin(app.context),
			// `forceCSSModules`: scope ALL css/less/scss as CSS modules (not just *.module.*).
			// Otherwise plain css/less/scss stays global (webpack `mode:'icss'`) and only
			// needs the ICSS default export so `import css from './App.less'` resolves.
			app.forceCSSModules ? enactForceCSSModulesPlugin(forcedCSSVirtual) : enactICSSInteropPlugins(),
			// Node builtin polyfills for the browser (webpack: node-polyfill-webpack-plugin
			// with additionalAliases console/domain/process/stream). `global` is already
			// supplied by ViteHtmlPlugin's head shim (R1), so only inject Buffer/process.
			// Skip for non-browser targets. Dropped for the SSR build in applySsrBuild.
			!['node', 'async-node', 'webworker'].includes(app.environment) &&
			enactNodePolyfillResolverPlugin(),
			!['node', 'async-node', 'webworker'].includes(app.environment) &&
			nodePolyfills({
				globals: {Buffer: true, process: true, global: false},
				protocolImports: true
			}),
			react({
				// @enact/* packages ship raw source (JSX inside .js, ESM) rather than
				// pre-compiled output, so they must be transpiled like app code. Mirror
				// webpack's `exclude: /node_modules.(?!@enact)/`: process everything except
				// non-@enact node_modules.
				exclude: babelTransformFilter,
				// Reuse the exact Enact babel preset so JSX/TS/decorator handling matches webpack.
				babel: {
					babelrc: false,
					configFile: false,
					// Advertise ESM support so babel-preset-enact's @babel/preset-env
					// (`modules: 'auto'`) preserves `import`/`export` for Rollup to bundle
					// and tree-shake. babel-loader sets this in the webpack path; the Vite
					// react plugin does not, so without it preset-env emits CommonJS and the
					// app collapses into un-bundled runtime `require()` calls.
					caller: {
						name: 'vite-plugin-react',
						supportsStaticESM: true,
						supportsDynamicImport: true,
						supportsTopLevelAwait: true
					},
					presets: [require.resolve('babel-preset-enact')]
				}
			}),
			ViteHtmlPlugin({
				entry,
				// Fall back to the webOS appinfo title when no app/theme title is set.
				title: app.title || ViteWebOSMetaPlugin.readTitle(app.context) || '',
				template: app.template || path.join(__dirname, 'html-template.ejs')
			}),
			// webOS metadata: emit/serve appinfo.json + referenced icon/splash assets
			// and localized resources/**/appinfo.json. Skip for non-browser targets.
			!['node', 'async-node', 'webworker'].includes(app.environment) &&
			ViteWebOSMetaPlugin({
				context: app.context,
				publicPath: app.publicUrl || '/'
			}),
			// iLib runtime: define ILIB_* constants and make locale/resource data
			// available (build: copy trees; dev: serve from source), with optional
			// `-l` locale filtering. Replaces the webpack ILibPlugin. Skip for
			// non-browser targets.
			!['node', 'async-node', 'webworker'].includes(app.environment) &&
			ViteILibPlugin({
				context: app.context,
				publicPath: app.publicUrl || '/',
				ilibAdditionalResourcesPath,
				locales
			}),
			// ESLint (mirrors webpack eslint-webpack-plugin); skipped with --no-linting.
			!noLinting && enactEslintPlugin()
		].filter(Boolean)
	};
};
