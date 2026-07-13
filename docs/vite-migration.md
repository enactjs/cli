# Replacing webpack with Vite in `@enact/cli`: feasibility & status

**Task:** Look through React tooling libraries and assess whether webpack can be
replaced with Vite in `@enact/cli`, then apply a new Vite configuration.

## Verdict

**Yes for the everyday browser dev/build workflow (validated end-to-end); three
webOS-packaging features remain on webpack.** Vite (Rollup + esbuild) cleanly
covers `enact serve` / `enact pack` for a browser app and brings much faster cold
starts and HMR. Several webOS-specific features that started as webpack compiler
plugins have since been **re-authored as Vite/Rollup plugins** in `@enact/dev-utils`
and validated: **iLib i18n runtime + locale filtering** (`ViteILibPlugin`), **webOS
metadata** (`ViteWebOSMetaPlugin`), plus the HTML document (`ViteHtmlPlugin`) and
**ESLint**. Three features are **not yet ported** and still require webpack:
`--isomorphic` prerendering, `--snapshot` (V8), and framework externals (see the
gap list below). For those, `pack --vite` prints a "not supported, ignored" notice.

The Vite config lives at [`config/vite.config.js`](../config/vite.config.js); it
mirrors the `webpack.config.js` factory signature and reuses the existing Enact
tooling.

### Validated end-to-end ✅

Both paths were run against real apps — **Sandstone**
(`samples/sandstone/tutorial-hello-enact`, React 18, pre-compiled deps) and
**Limestone** (`samples/limestone/tutorial-hello-enact`, React 19, which ships
**raw `@enact` source** with JSX-in-`.js` and uses `~` npm imports — the harder,
more representative case):

- **`enact pack -p --vite`** → success on both. Limestone emits `main.js`
  (~550 kB), `main.css` (~70 kB with resolution-independence applied — `px` →
  `rem`, and design tokens as CSS custom properties from `@import-json`),
  `index.html` linking both, and font assets. CSS-module scoping is consistent
  across JS and CSS (e.g. `src_App_App_app__e2Hkq` in both), matching the webpack
  `cssModuleIdent` format.
- **`enact serve --vite`** → success on both. Serves the synthesized HTML with
  Vite's HMR client injected, transforms JSX-in-`.js` via the React automatic
  runtime, and pre-bundles the `@enact/*` dependencies.
- **iLib i18n runtime** validated (constants baked/defined, locale data
  copied/served); **locale filtering** `-l en-US,ko-KR` trims 70 MB → 19 MB
  (6,755 → 1,988 files, correct locales); **webOS meta** `appinfo.json` + icons
  emitted/served; **ESLint** lints the sources (clean) and enforces rules.
- **Real-browser render** verified on several apps — `qa-dropdown` (nested
  `@enact`), the redux sample (webpack HMR API), and the aggregate `all-samples`
  (imports source from 15 sibling packages): each mounts and renders correctly
  (see runtime fixes R1–R8 below). Note: HTTP-200 / transform checks do **not**
  execute the page JS — always load a real browser.

Eight config issues plus eight runtime issues were found and fixed while
validating. The runtime ones (mostly only visible when the page actually executes
in a real browser — HTTP-200/transform checks don't run the page JS) were:

- **R1 — `global` is not defined.** Enact's `polyfills.js`/core-js reference the
  Node `global`, absent in the browser (webpack supplied it via
  node-polyfill-webpack-plugin). Fix: `ViteHtmlPlugin` injects a classic
  `<script>globalThis.global=globalThis</script>` in `<head>`, before the deferred
  module entry.
- **R2 — CommonJS polyfills.** `polyfills.js` → `corejs-proxy.js` use
  `require('core-js/stable')`; `require` doesn't exist in browser ESM
  (`require is not defined`). Fix: the generated combined entry imports
  `core-js/stable` as an ESM bare specifier (Vite pre-bundles the CJS→ESM),
  aliased to the CLI's `core-js` since apps don't depend on it directly.
- **R3 — multiple copies of React** ("Invalid hook call"). Nested `@enact` deps
  (`@enact/limestone/node_modules/@enact/*`) + Vite pre-bundling resolved several
  physical `react` copies. Fix: `resolve.dedupe: ['react','react-dom','react/jsx-runtime','react/jsx-dev-runtime']`.
- **R4 — webpack's HMR API in app source** (`module is not defined`). Some apps
  guard reducer hot-reload with `if (module.hot) { module.hot.accept(…) }`;
  `module` exists in the webpack runtime but not in Vite's browser ESM (app source
  isn't CJS-wrapped like pre-bundled deps). Vite's `define` can't replace it
  (esbuild treats `module` specially), so a `transform` plugin
  (`enact-neutralize-webpack-hmr`) rewrites `module.hot` → `false` in app source;
  the webpack-only block is dead-stripped. (Surfaced on the redux sample.)
- **R5 — Vite fs allow-list.** Apps that import source/assets from **sibling**
  packages (e.g. the aggregate `all-samples`) are blocked by Vite's `server.fs`
  allow-list ("outside of Vite serving allow list"). Fix: `server.fs.strict =
  false`, matching webpack-dev-server's unrestricted file serving.
- **R6 — dependency-scan churn / repeated reloads.** Enact apps ship no
  `index.html`, so Vite's dep scanner had no entry to crawl and discovered deps
  lazily on first request — each new one triggering a re-optimize + full page
  reload (severe for apps importing from many packages). Fix:
  `optimizeDeps.entries = [<app entry>]` so the scanner crawls the whole import
  graph (incl. cross-package imports) and pre-bundles in one pass.
- **R7 — theme i18n resource 404s.** `ViteILibPlugin` set `ILIB_<THEME>_PATH`
  (used by the theme's `$L`/`ResBundle` as `basePath`) to the theme **package
  root** instead of its `resources/` dir, so the loader fetched
  `…/ilibmanifest.json` (404) and then blindly requested the default string paths
  (`strings.json`, `en/strings.json`, … — all 404). Fix: point the constant at the
  served data dir; the iLib **base** still points at the package dir (its loader
  appends `locale/` itself). In `dev-utils/plugins/ViteILibPlugin`.
- **R8 — duplicate `@enact` copies.** Apps that aggregate independently-installed
  sibling packages resolve a separate physical copy of every `@enact/*` dep,
  multiplying dep-optimization + bundle size (and risking multiple-instance bugs,
  the `@enact` analogue of R3). Fix: extend `resolve.dedupe` to the app's installed
  `@enact/*` packages (collapsed e.g. 15 copies → 1 on `all-samples`).

The eight config issues (all in `config/vite.config.js` unless noted) — the
non-obvious part of the port — were:

1. **ESM must be preserved for Rollup.** `babel-preset-enact`'s `@babel/preset-env`
   uses `modules: 'auto'`, which emits **CommonJS** unless the caller advertises
   ESM support. `babel-loader` sets this; `@vitejs/plugin-react` does **not**, so
   the app collapsed into un-bundled runtime `require()` (a 1 kB bundle). Fix: pass
   `babel.caller = { supportsStaticESM: true, … }`.
2. **PostCSS plugins must be instances.** Vite's `css.postcss.plugins` wants
   instantiated plugins, not the string names `postcss-loader` resolves. Fix:
   `require()` + invoke each (`loadPostCss`).
3. **`cssModuleIdent` loader context + CSS-safe names.** It reads
   `context.rootContext` (for the hash); passing only `resourcePath` threw
   `path.relative(undefined,…)`. Fix: pass `{resourcePath, rootContext: app.context}`.
   Also, for **nested** `@enact` deps (e.g.
   `@enact/limestone/node_modules/@enact/ui/…`) the derived readable name embeds a
   literal `@`, invalid unescaped in a CSS class selector (108 `css-syntax-error`
   warnings + broken selectors on `qa-dropdown`). Webpack avoids this by using
   short hashes in production; our config uses readable names in both modes, so we
   sanitize the ident to `[A-Za-z0-9_-]` (the trailing hash keeps it unique).
4. **JSX-in-`.js` for the dev scanner.** esbuild's dep scanner defaults `.js` to
   the `js` loader and can't parse Enact's JSX-in-`.js`. Fix:
   `optimizeDeps.esbuildOptions.loader = { '.js': 'jsx' }`.
5. **iLib non-browser loaders** (see below) break both the Rollup build and the
   esbuild optimizer. Fix: a shared `ILIB_LOADER_RE` neutralizes them via
   `build.commonjsOptions.ignore` and an esbuild stub plugin.
6. **`@enact/*` deps ship raw source.** Unlike most packages, `@enact/*` is
   distributed unbuilt (`main` points at `src/`): JSX-in-`.js`, ESM, decorators,
   and Babel proposals like `export default from 'ilib'`. It must be transpiled
   like app code — exactly what webpack's `exclude: /node_modules.(?!@enact)/` does.
   Two fixes, because the build and the dev pre-bundler use different engines:
   (a) **Rollup build** — set the react plugin's
   `exclude: /[\\/]node_modules[\\/](?!@enact[\\/])/` so babel-preset-enact runs on
   `@enact/*`. (b) **Dev dependency optimizer** — esbuild can't parse the raw
   syntax at all (e.g. `export default from` → `Expected ";"`), so an
   `optimizeDeps` esbuild plugin (`enact-babel-optimize`) runs babel-preset-enact
   on `@enact/*` source (ESM-preserving) before esbuild pre-bundles it.
   (Fix (a) surfaced on Limestone; fix (b) surfaced on apps like `qa-dropdown`
   whose graph pulls `@enact/i18n` into pre-bundling.)
7. **LESS/CSS `~` npm imports.** `~pkg` resolves via webpack in `less-loader`;
   Vite has no equivalent. Fix: a custom Less `FileManager` (`lessTildeImportPlugin`)
   for LESS `@import`s, plus a `resolve.alias` `{find: /^~/, replacement: ''}` for
   plain CSS `@import`s.
8. **`~` in `@import-json` rules.** The webpack config had an inline
   `postcss-import-json-tilde` plugin (which I initially missed) to resolve `~`
   before `@daltontan/postcss-import-json`. Fix: ported as `tildeJsonImportPlugin`.

## What ports cleanly (done in `vite.config.js`)

| Concern | webpack | Vite equivalent |
| --- | --- | --- |
| JSX / TS / decorators | `babel-loader` + `babel-preset-enact` | `@vitejs/plugin-react` with `babel.presets: [babel-preset-enact]` |
| App options (ri, accent, alias, title, publicUrl…) | `optionParser` (`@enact/dev-utils`) | same `optionParser`, reused verbatim |
| PostCSS (autoprefix, flexbugs, preset-env, **resolution independence**, JSON tokens) | `postcss-loader` chain | `css.postcss.plugins` (identical array) |
| LESS accent/skin `modifyVars`, `__DEV__` | `less-loader` `lessOptions.modifyVars` | `css.preprocessorOptions.less.modifyVars` |
| SCSS/SASS | `sass-loader` | native Vite (needs `sass` dep) |
| CSS Modules scoped-name identity | `cssModuleIdent` (`getLocalIdent`) | `css.modules.generateScopedName` calling the same fn |
| `define` globals (`NODE_ENV`, `PUBLIC_URL`, `ENACT_PACK_ISOMORPHIC`, `ENACT_PACK_NO_ANIMATION`) | `DefinePlugin` | `define` |
| Content hashing / no-split-css | `output.[contenthash]`, `splitChunks` | `rollupOptions.output`, `build.cssCodeSplit` |
| Minification | Terser + CssMinimizer | `build.minify: 'terser'`, `cssMinify` |
| HTML document (no `index.html` in Enact apps) | `HtmlWebpackPlugin` + `.ejs` | `@enact/dev-utils` `ViteHtmlPlugin` renders the same template; serves it in dev, emits `index.html` (entry + CSS) in build |
| Polyfills first | `entry: [polyfills, appMain]` | generated combined entry (`node_modules/.cache/enact-vite/index.js`) |
| **iLib i18n runtime** (`ILIB_*` constants + locale/resource data) | `ILibPlugin` (`DefinePlugin` + asset emission) | `@enact/dev-utils` `ViteILibPlugin` — defines the constants (build + dev-optimizer) and copies (build) / serves (dev) the data |
| **iLib locale filtering** (`-l used/tv/signage/all/list`) | via isomorphic/prerender flow | `ViteILibPlugin` `locales` option — trims the emitted/served manifest to requested locales + shared data |
| **webOS metadata** (`appinfo.json` + icons, localized appinfo) | `WebOSMetaPlugin` | `@enact/dev-utils` `ViteWebOSMetaPlugin` — emits (build) / serves (dev) appinfo + assets; title fallback |
| **ESLint** (`eslint-config-enact`, `--no-linting`) | `eslint-webpack-plugin` | inline `enact-eslint` plugin — lints at build start; errors fail the build, dev warns |
| Source maps | `devtool` | `build.sourcemap` / `css.devSourcemap` |

## Webpack-only concerns and their status

Items 1–6 are `@enact/dev-utils` webpack plugins that tap the
`compiler`/`compilation` lifecycle; items 7–9 are webpack loader/config behaviors,
not dev-utils plugins. Status varies (ported / dropped / resolved / not yet):

1. ~~**`ILibPlugin`**~~ — **ported** as
   [`ViteILibPlugin`](../../dev-utils/plugins/ViteILibPlugin). Since `@enact/i18n`'s
   runtime `Loader.js` is bundler-agnostic (XHR from the `ILIB_*` constants), the
   Vite plugin defines those constants (build **and** the dev dep-optimizer, via
   `optimizeDeps.esbuildOptions.define`) and makes the data available — copying the
   iLib `locale/` + app/theme `resources/` trees on `writeBundle` (build) and
   serving them from source via middleware (dev). Non-browser iLib loaders are
   neutralized separately (`ILIB_LOADER_RE`). **Locale filtering** (webpack's `-l`)
   is supported via the `locales` option — `-l en-US,ko-KR` trims 70 MB → 19 MB
   (6,755 → 1,988 files) and emits a trimmed manifest. **Validated:**
   `/node_modules/ilib` baked into the prod bundle; full and filtered data
   copied (build) / served (HTTP 200, dev).
2. ~~**`WebOSMetaPlugin`**~~ — **ported** as
   [`ViteWebOSMetaPlugin`](../../dev-utils/plugins/ViteWebOSMetaPlugin). Discovers
   the root `appinfo.json` (root or `./webos-meta/`) + localized
   `resources/**/appinfo.json`, emits them and their referenced icon/splash assets
   (build: `writeBundle` copy; dev: middleware), and supplies the `<title>`
   fallback via `ViteWebOSMetaPlugin.readTitle`. **Validated:** `appinfo.json` +
   `icon*.png` land in `dist` and serve (HTTP 200) in dev. *Remaining:*
   `$`-prefixed sys-assets.
3. **`PrerenderPlugin` + isomorphic mixin** — server-renders the app to static
   HTML per-locale (`enact pack --isomorphic`). *Effort: high — not ported.*
   **Investigated:** Vite has native SSR (`ssrLoadModule`), but a spike hit a
   concrete first blocker — the SSR module runner does not apply the JSX-in-`.js`
   transform (`App.js: Unexpected token '<'`), and that is only the first hurdle.
   A faithful port also needs a `window`/`document` mock, the `FileXHR` locale-data
   loader, per-locale rendering, `screenTypes`/font handling, a `locale-map`, and
   hydration-safe markup — i.e. a re-implementation of `vdom-server-render` +
   `templates`, not a config tweak. Left on webpack. **A full implementation
   scope** (phases, effort, risks, validation plan) is in
   [`vite-isomorphic-scope.md`](./vite-isomorphic-scope.md).
4. **`SnapshotPlugin`** — emits a V8 snapshot blob (`--snapshot`). *Not portable
   here.* Requires the webOS `V8_MKSNAPSHOT` toolchain (absent in this
   environment, so unverifiable) and is coupled to the webpack module runtime +
   injected snapshot-helper entries. A Rollup equivalent would need its own
   snapshot-safe bootstrap; deferred until the mksnapshot toolchain is available.
5. ~~**Framework externals**~~ — **ported** (`mixins/vite-framework.js` +
   `pack.js` `--framework`/`--externals`). Webpack's DLL maps deep module requests to
   IDs in a prebuilt bundle via a manifest; the Vite analog is a shared framework ESM
   build addressed by an **import map** (exact keys per specifier, from a manifest),
   with `build.rollupOptions.external` on the app build. Browser-validated end-to-end
   on limestone/qa-a11y: 138-specifier framework + `enact.css`, app externalizes 60
   specifiers, boots fully styled with a single React instance, console clean. Full
   findings in [`vite-framework-externals-spike.md`](./vite-framework-externals-spike.md).
6. **`GracefulFsPlugin`** — patches webpack's output FS to avoid EMFILE. Not
   needed under Vite (different FS handling). *Drop.*
7. **`node-polyfill-webpack-plugin`** — supplies Node builtins (`global`,
   `process`, `Buffer`) in the browser bundle. **Partly resolved:** the runtime
   `global` reference in Enact's `polyfills.js` is handled (runtime fixes R1/R2 —
   `ViteHtmlPlugin` shim + core-js ESM entry), and `process.env.NODE_ENV` is
   covered by `define`. Fuller coverage (`Buffer`, full `process`), mostly for
   screenshot tests, is **not** wired — add `vite-plugin-node-polyfills` if needed.
8. **`icss` mode for non-`*.module` CSS / `forceCSSModules`** — Vite auto-treats
   only `*.module.*` as modules; the webpack `mode: 'icss'` nuance and the global
   `forceCSSModules` toggle need a custom transform. *Not ported.*
9. ~~**LESS/CSS `~` npm imports**~~ — **resolved** (by config fixes #7 and #8 in
   the config-issues list above): `lessTildeImportPlugin` (LESS),
   `resolve.alias /^~/` (CSS), and `tildeJsonImportPlugin` (`@import-json`).

## Command wiring (applied, behind a flag)

`commands/pack.js` and `commands/serve.js` now branch to the Vite path when it is
opted into via **`--vite`** or **`ENACT_BUNDLER=vite`**; otherwise webpack runs
unchanged. Both bundlers coexist during migration.

- `enact serve --vite` → `vite.createServer(...).listen()` (native ESM dev server, HMR via `@vitejs/plugin-react`).
- `enact pack --vite` / `enact pack -p --vite` → `vite.build(...)` (supports `--watch`, `-o/--output`, `--content-hash`, `--no-split-css`, `-l/--locales`, `--no-linting`, `--entry`).
- Build-shaping flags are wired via **`mixins.applyVite`** (the Vite counterpart to
  the webpack `mixins.apply`, in `dev-utils/mixins/vite.js`):
  - `--stats` → static bundle-analysis treemap `dist/stats.html`
    (`rollup-plugin-visualizer`, mirroring webpack's `webpack-bundle-analyzer`).
  - `--verbose` → raises Vite's log level and narrates build phases with a module
    count (no percentage — Rollup has no fixed total up front, unlike webpack's `ProgressPlugin`).
  - `--no-minify` (private) → Terser with `mangle:false` + beautify, keeping dead-code
    removal (mirrors the webpack `unmangled` mixin). Only affects production builds.
- `enact eject --vite` wires the ejected app's scripts to the Vite path (see
  [vite-eject-testing.md](vite-eject-testing.md)).
- **`--framework` / `--externals`** are wired via **`mixins/vite-framework.js`** (the
  Vite counterpart to the webpack DLL `framework`/`externals` mixins): `--framework`
  builds the shared `@enact`+react+ilib bundle as reusable ESM + a specifier manifest +
  one `enact.css`; `--externals=<path>` externalizes those specifiers from the app build
  and injects an import map (+ the shared stylesheet) resolved from the manifest.
  `--externals-public` sets the import-map base URL (remote framework path).
  Browser-validated on limestone/qa-a11y. See
  [vite-framework-externals-spike.md](vite-framework-externals-spike.md).
- Webpack-only flags still not ported (`--isomorphic`, `--snapshot`) print a "not yet
  supported, ignored" notice.

The reusable bundler plugins were **added to `@enact/dev-utils`** — mirroring how
the webpack plugins (`ILibPlugin`, `WebOSMetaPlugin`, …) live there — and are
consumed by `config/vite.config.js`:
[`ViteHtmlPlugin`](../../dev-utils/plugins/ViteHtmlPlugin),
[`ViteILibPlugin`](../../dev-utils/plugins/ViteILibPlugin), and
[`ViteWebOSMetaPlugin`](../../dev-utils/plugins/ViteWebOSMetaPlugin). The
config-level pieces (PostCSS chain incl. `~`/JSON-import handling, LESS
`modifyVars`, the ESLint plugin) stay in `cli/config`, matching where
`getStyleLoaders`/the eslint config live for webpack.

> **dev-utils must be current.** Because these plugins live in `@enact/dev-utils`,
> the copy under `cli/node_modules/@enact/dev-utils` must include them. Symlink the
> sibling source (`npm link`/junction) or reinstall so the CLI picks up
> `ViteHtmlPlugin`, `ViteILibPlugin`, and `ViteWebOSMetaPlugin`. (They have been
> synced into the local install here.)

## Try it

```bash
cd cli
npm install                     # pulls in vite + @vitejs/plugin-react + terser
# from an Enact app dir:
enact serve --vite                   # or: ENACT_BUNDLER=vite enact serve
enact pack -p --vite                 # production build (full iLib data)
enact pack -p --vite -l en-US,ko-KR  # production build, locale-filtered
```

> Status: **validated** on Sandstone and Limestone (build + serve), including
> iLib i18n runtime + locale filtering, webOS metadata, and ESLint. Not yet
> exercised: the `icss`/`forceCSSModules` nuance. Node 20+ is required for
> `require()` of the ESM-only `vite` package (validated on Node 24).

## Still not ported (webpack remains the default for these)

- **`--isomorphic`** prerendering and **`--snapshot`** — see gaps #3–#4 above. Each is
  a substantial project (not a config tweak); the Vite path prints a "not yet
  supported, ignored" notice for these flags. (**Framework externals** — gap #5 — is
  now ported.)
- **`icss` mode / `forceCSSModules`** (gap #8): Vite treats only `*.module.*` as
  CSS modules; the webpack `mode: 'icss'` nuance isn't replicated.
- **Framework refinement** (post-port): building `--framework` *in a theme repo*
  (e.g. limestone) should include the theme's own components (webpack's
  `libraries.push('.')` case) — the current enumeration scans `node_modules/@enact`,
  so build the framework where all `@enact` incl. the theme are installed (e.g. an
  app/sample context). (`--externals-polyfill` — move core-js into the framework — **is**
  wired: `pack --framework --externals-polyfill` folds core-js into the framework, and
  `pack --externals=<path> --externals-polyfill` delegates it out of the app.)

## Recommendation

Adopt Vite behind a feature flag for the **browser dev/build** path first (biggest
DX win, lowest risk) — now validated end-to-end including i18n runtime, locale
filtering, webOS metadata, and ESLint. Keep webpack as the default for
`--isomorphic`, `--snapshot`, and framework-externals builds; those three are the
remaining work and each warrants its own focused effort (isomorphic first, as it's
the most-used; snapshot last, as it needs the webOS mksnapshot toolchain to even
validate).
