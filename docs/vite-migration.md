# Replacing webpack with Vite in `@enact/cli`: feasibility & status

**Task:** Look through React tooling libraries and assess whether webpack can be
replaced with Vite in `@enact/cli`, then apply a new Vite configuration.

## Verdict

**Yes for the everyday browser dev/build workflow (validated end-to-end); every
webOS-packaging feature is now ported.** Vite (Rollup + esbuild) cleanly
covers `enact serve` / `enact pack` for a browser app and brings much faster cold
starts and HMR. Several webOS-specific features that started as webpack compiler
plugins have since been **re-authored as Vite/Rollup plugins** in `@enact/dev-utils`
and validated: **iLib i18n runtime + locale filtering** (`ViteILibPlugin`), **webOS
metadata** (`ViteWebOSMetaPlugin`), plus the HTML document (`ViteHtmlPlugin`) and
**ESLint**. **`--isomorphic` prerendering and framework externals are also ported and
browser-validated** (`mixins/vite-isomorphic.js`, `mixins/vite-framework.js`).
**`--snapshot`** (V8) is now ported too (`mixins/vite-snapshot.js`) and locally validated
as snapshot-safe — its only remaining step is a build + install on a webOS board with the
firmware-matched `V8_MKSNAPSHOT` toolchain (unavailable in this environment; see the
"Testing `--snapshot` on a webOS board" section).

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
   `icon*.png` land in `dist` and serve (HTTP 200) in dev. `$`-prefixed sys-assets
   (`$icon.png` → `sys-assets/<spec>/icon.png`, emitted per-spec preserving the
   layout, appinfo value left untouched) are now handled — matching the webpack
   plugin; verified against a fixture (sys-assets across specs, dedup across
   locales, regular assets, untouched `$` values).
3. ~~**`PrerenderPlugin` + isomorphic mixin**~~ — **ported** (`mixins/vite-isomorphic.js` +
   `pack.js` `viteIsomorphic`). Uses a real **`vite build --ssr`** of the app entry (the key
   correction from the first spike, which used `ssrLoadModule` and hit the JSX-in-`.js`
   transform gap), then per-locale server render (`FileXHR` for iLib locale data, no DOM
   shim needed) + assembly into the webpack-compatible output (fallback `index.html` +
   deduped `index.<variant>.html` + `locale-map.json` + per-locale webOS `appinfo.json`),
   reusing the bundler-agnostic `templates.js`/`FileXHR`. Browser-validated end-to-end on
   qa-a11y (`-p -i -l en-US,ko-KR`): prerendered markup hydrates with no console warnings in the
   production build. (A dev build shows two dev-only React warnings that are by-design in
   `@enact/i18n` — locale class deferred to the client — and identical to webpack's isomorphic
   output, including with `--externals`; `-p` strips them. Details in the scope doc.)
   Full findings/phases in [`vite-isomorphic-scope.md`](./vite-isomorphic-scope.md).
4. ~~**`SnapshotPlugin`**~~ — **ported (build-complete; on-device validation pending
   the toolchain).** `--snapshot` (which implies `--isomorphic`) now builds through
   `mixins/vite-snapshot.js`: the client build becomes a **self-contained UMD** `main.js`
   (`output.format:'umd'`, `name:'App'`, `preserveEntrySignatures:'strict'`,
   `inlineDynamicImports`) with a `global` banner for the bare-V8 context, so the app's
   default export is exposed as the `App` global — mirroring webpack's
   `output.library='App'`/`libraryTarget='umd'`. The snapshot helpers are reimplemented in
   **ESM** ([`snapshot-helper-esm.js`](../../dev-utils/plugins/SnapshotPlugin/snapshot-helper-esm.js)
   + [`snapshot-mock.js`](../../dev-utils/plugins/SnapshotPlugin/snapshot-mock.js), reusing
   the bundler-agnostic `mock-window.js` + `@enact/core/snapshot`): import order deterministically
   installs the mock window before `react-dom/client` loads (Rollup hoists CJS requires, so the
   original CJS helper's in-line ordering can't be reproduced), and `global.updateEnvironment`
   is defined for the on-device window rebind. A resolver redirects `react-dom/client` → the
   facade and no-ops absent optional deps (`fbjs` is gone in React 19; a theme may lack
   `internal/$L`). After the isomorphic prerender/assembly (startup script kept **classic**, since
   `main.js` is UMD), `mksnapshot` (`V8_MKSNAPSHOT`) runs against `main.js` to emit
   `snapshot_blob.bin` and tag `appinfo.json` `v8SnapshotFile`.
   **Validated end-to-end with a real toolchain.** Against `mksnapshot` (V8) the UMD bundle
   produces a genuine, non-zero startup blob (qa-a11y: **4.6 MB**, in line with the ~4.3 MB
   webpack reference). The syntax must parse in the target board's V8; the app's browserslist
   drives the output by default, and `V8_SNAPSHOT_TARGET` force-lowers it for a much older
   firmware than the app targets. `--snapshot --externals` is unsupported (the snapshot must
   embed `@enact`), matching webpack. The blob's V8 must match the firmware — a mismatched
   `mksnapshot` is rejected/unparseable (see the matrix below).

   **core-js in the snapshot — parity with webpack, verified.** core-js is included by default
   (as in the webpack path). Its WeakMap-based internal state serializes fine on a **modern**
   snapshot V8, but a **very old** one (~Chrome 53) can't serialize a WeakMap-with-entries —
   `mksnapshot` throws `illegal access` → 0-byte blob. This is a **core-js-3 + old-V8
   limitation, not a bundler difference**: measured on the *same* `mksnapshot.53` against
   qa-a11y built at `chrome 53`:

   | Bundle (chrome 53 target, core-js 3.22.8) | Result |
   | --- | --- |
   | **webpack** + core-js | `illegal access` → 0-byte blob |
   | **Vite** + core-js | `illegal access` → 0-byte blob (identical) |
   | **Vite**, `ENACT_SNAPSHOT_NO_COREJS=1` | ✅ 4.6 MB blob |

   So webpack and Vite behave identically; Vite additionally offers `ENACT_SNAPSHOT_NO_COREJS`
   to still emit a blob (minus runtime builtin polyfills) on such old firmware, where webpack
   emits nothing. On a firmware-matched **modern** `mksnapshot` (e.g. Chrome 132) neither the
   `V8_SNAPSHOT_TARGET` lowering nor the no-core-js opt-out is needed — the default build (app
   target + core-js) is correct for both bundlers. **Not validated here:** the blob on the
   actual firmware (needs that firmware's `mksnapshot`) + on-device hydration.
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
7. ~~**`node-polyfill-webpack-plugin`**~~ — **ported.** `global` is supplied by
   `ViteHtmlPlugin`'s head shim (R1) and `process.env.NODE_ENV` by `define`; fuller
   coverage (`Buffer`, full `process`, and the node builtin modules — the webpack
   plugin's `additionalAliases: console/domain/process/stream`) is now wired via
   **`vite-plugin-node-polyfills`** in `config/vite.config.js`, gated to browser
   targets. Globals are injected **reference-only** (like webpack's `ProvidePlugin`
   — no global `typeof process` flip, no bundle bloat when unused; verified qa-a11y
   doesn't bundle `buffer` and exposes no `window.Buffer`/`process`). A small
   `enact-node-polyfill-resolver` `resolveId` plugin resolves the injected shim
   specifiers (`vite-plugin-node-polyfills/*`, `node-stdlib-browser`) from the CLI's
   `node_modules`, since apps are built with `root: app.context` and can't reach
   them otherwise. For the SSR/isomorphic build, `vite-isomorphic.js`'s
   `applySsrBuild` drops these plugins so the Node bundle uses the real builtins
   (`path`/`fs`/`crypto`); verified the isomorphic build still prerenders cleanly.
8. ~~**`icss` mode for non-`*.module` CSS / `forceCSSModules`**~~ — **both ported.**
   The Enact `forceCSSModules` option (scope ALL css/less/scss, not just `*.module.*`)
   is wired via `enactForceCSSModulesPlugin` in `config/vite.config.js`. Vite decides
   module-ness only from the `.module.` filename infix (`cssModuleRE`) with no override
   hook, so the plugin resolves each non-module style import and redirects it to a
   **virtual `.module` id** — keeping the real directory so LESS `@import`/`url()` still
   resolve, serving the real file via `load`, and letting `generateScopedName` recover
   the real path for webpack-parity hashing. Verified end-to-end: non-module CSS **and**
   LESS scope and export a class map, matching webpack's ident (`src_App_App_app__<hash>`).

   The webpack `mode:'icss'` path (the **default**, option off) was initially assessed as
   a no-op on the grounds that Vite already leaves non-module CSS global and `:export`
   is unused in @enact/limestone. **That assessment was wrong** and is now fixed. Scoping
   is indeed identical, but css-loader in `icss` mode still emits a **default export**
   (the ICSS `:export` locals, usually `{}`), whereas Vite emits *no* default export for
   plain CSS at build time. So the classic Enact idiom on a **non-module** stylesheet —
   ```js
   import css from './App.less';        // plain .less, global classes
   kind({styles: {css, className: 'app'}});
   ```
   — is a hard Vite build error (`"default" is not exported by "src/App/App.less"`),
   even though webpack builds it fine (`classnames/bind` just falls back to the literal
   global class name). `limestone/samples/qa-i18n` hits exactly this; `qa-a11y` does not,
   because it uses `App.module.less`.

   Parity is restored by `enactICSSInteropPlugins()` — **without scoping anything**:
   - `enact-icss-extract` (normal order → after `vite:css` compiles LESS/SCSS, before
     `vite:css-post` builds the JS proxy) lifts `:export {…}` blocks into a locals map
     and strips them from the emitted CSS, as css-loader does.
   - `enact-icss-default-export` (`enforce:'post'` → after `vite:css-post`) appends
     `export default <locals>` when the proxy has none. Modules that already have a
     default export (dev's CSS-string proxy, `?inline`/`?url`/`?raw`) are left alone.

   Verified against webpack on `qa-i18n` with a `.app{color:#123456}` rule plus an
   `:export{brandColor:#ff0000}` block — both bundlers emit the identical
   `styles:{css:{brandColor:"#ff0000"},className:"app"}`, keep `.app` **global**
   (unscoped), and strip `:export` from the CSS. `*.module.*` files are untouched
   (`qa-a11y` still scopes 623/660 classes; the rest are the deliberately global
   `enact-locale-*`).
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
- **`--isomorphic`** is wired via **`mixins/vite-isomorphic.js`** + `pack.js`'s
  `viteIsomorphic` (client `hydrateRoot` build + `vite build --ssr` + per-locale prerender +
  webpack-compatible HTML/`locale-map.json`/`appinfo.json` assembly). Browser-validated.
- `--snapshot` is not ported (needs the webOS `V8_MKSNAPSHOT` toolchain) and prints a "not
  yet supported, ignored" notice.

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
> iLib i18n runtime + locale filtering, webOS metadata, and ESLint. Node 20+ is
> required for `require()` of the ESM-only `vite` package (validated on Node 24).

## Ported, pending on-device validation

- **`--snapshot`** (gap #4) — **build-complete and locally validated** (the UMD `main.js`
  evaluates snapshot-safe in a bare V8 and exposes the `App`/`updateEnvironment`/`ReactDOMClient`
  globals); only the actual `mksnapshot` blob + on-device hydration remain, which need the
  firmware-specific `V8_MKSNAPSHOT` toolchain and a webOS board. See gap #4 above and the
  **Testing `--snapshot` on a webOS board** section below.

## Everything else is ported

- ~~**Framework self-inclusion in a theme repo**~~ — **ported.** Building `--framework`
  *inside* a theme repo (e.g. limestone) now includes the theme's own components, mirroring
  webpack's `libraries.push('.')`. `mixins/vite-framework.js` `enumerateSelfSpecs(context)`
  detects a `@enact/*` theme package (has `ThemeDecorator`/`MoonstoneDecorator`, or is
  `@enact/i18n`) and enumerates its own component subpaths as `@enact/<theme>/<component>`
  specifiers; `applyFramework` adds a `resolve.alias` (`@enact/<theme>` → repo root, covering
  transitive self-references) and extends `commonjsOptions` to the repo root so the theme's
  own CJS-in-source (e.g. a `module.exports` `fontGenerator`) interops. Verified on limestone:
  a repo-root `--framework` build emits **138 specifiers = 56 own components + 76 node_modules
  `@enact` + react/ilib**, with `enact.css`. The change is gated on theme-repo detection, so a
  sample/app-context build (the Jenkins path) is unaffected. (`--externals-polyfill` — move
  core-js into the framework — is also wired: `pack --framework --externals-polyfill` folds
  core-js in, and `pack --externals=<path> --externals-polyfill` delegates it out of the app.)

## Recommendation

Adopt Vite behind a feature flag for the **browser dev/build** path first (biggest
DX win, lowest risk) — validated end-to-end including i18n runtime, locale filtering,
webOS metadata, and ESLint. Beyond that, **`--isomorphic` and framework externals are
now ported and validated** too. **`--snapshot`** is now ported and locally validated
(snapshot-safe UMD bundle); it just needs a final on-device pass on a webOS board with
the `V8_MKSNAPSHOT` toolchain — see below.

## Testing `--snapshot` on a webOS board

The snapshot blob is a **build-time** artifact and requires a `mksnapshot` binary whose
V8 version **matches the target firmware's Chrome** (from the same webOS SDK/NDK release) —
e.g. a Chrome-132 board needs that firmware's `mksnapshot`, **not** an arbitrary/old one. A
mismatched binary either can't parse the modern output or produces a blob the board ignores
at load. `mksnapshot` is a **Linux** tool (32-bit for older releases); on Windows run it via
WSL or a Linux build machine (the guide's "doesn't support Windows OS" note). Steps:

1. **Build with the firmware-matched toolchain**:
   ```
   export V8_MKSNAPSHOT=/path/to/mksnapshot        # matches the board's Chrome
   ENACT_BUNDLER=vite enact pack -p --snapshot      # add -l en-US,ko-KR for multi-locale
   ```
   Expect: `Generated V8 snapshot blob (snapshot_blob.bin) and tagged appinfo.json.`
   Verify `dist/snapshot_blob.bin` is **non-zero** and `dist/appinfo.json` has
   `"v8SnapshotFile": "snapshot_blob.bin"`. (Without `V8_MKSNAPSHOT` the build still
   succeeds and prints a skip notice; the app runs, just without the snapshot.)
   *Old-firmware knobs (rarely needed):* `V8_SNAPSHOT_TARGET=chrome53` force-lowers the
   syntax for a V8 older than the app targets, and `ENACT_SNAPSHOT_NO_COREJS=1` drops core-js
   when that old V8 can't serialize its WeakMap state (see gap #4 — webpack hits the same
   wall). On a modern firmware-matched `mksnapshot`, use neither.
2. **Package + install (developer mode, not hosted)** — the snapshot is loaded by WAM
   from the app's local install dir, so it must be a packaged IPK, not a served URL:
   ```
   ares-package dist
   ares-install ./com.*.ipk        # Developer Mode enabled on the board
   ```
3. **Confirm the snapshot is actually used** — launch the app and check it renders, then
   confirm WAM loaded the blob (via WAM logs / the `--profile-deserialization` output, or a
   measurable cold-start improvement) rather than silently falling back — a `mksnapshot`
   whose V8 doesn't match the firmware is ignored at load, so "it rendered" alone isn't proof.

If step 1's blob is 0-byte, check `mksnapshot`'s stderr: `Unexpected token` means the
binary is **older** than the app's syntax target (use the firmware-matched one, or
`V8_SNAPSHOT_TARGET`); `illegal access` in module init is the core-js/WeakMap case on very
old V8 (`ENACT_SNAPSHOT_NO_COREJS=1`, same limitation as webpack); a `window`/`document`
`ReferenceError` means app/framework code touched the DOM at snapshot time (the local
bare-V8 `vm` check guards this and is clean for qa-a11y).
