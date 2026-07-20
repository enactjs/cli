# Vite bundler support in `@enact/cli`

`@enact/cli` supports **Vite (Rollup + esbuild)** as a bundler alongside webpack for
`enact serve` and `enact pack`. The Vite path is opt-in — `--vite` or
`ENACT_BUNDLER=vite`. Webpack remains the default.

The Vite config lives at [`config/vite.config.js`](../config/vite.config.js); it
mirrors the `webpack.config.js` factory signature and reuses the existing Enact
tooling.

## Overview

Vite covers `enact serve` / `enact pack` for a browser app and brings much faster cold
starts and HMR. The webOS-specific features that exist as webpack compiler plugins are
re-authored as Vite/Rollup plugins in `@enact/dev-utils`: **iLib i18n runtime + locale
filtering** (`ViteILibPlugin`), **webOS metadata** (`ViteWebOSMetaPlugin`), the HTML
document (`ViteHtmlPlugin`), and **ESLint**. **`--isomorphic` prerendering and framework
externals** are implemented and browser-validated (`mixins/vite-isomorphic.js`,
`mixins/vite-framework.js`). **`--snapshot`** (V8) is implemented
(`mixins/vite-snapshot.js`) and produces a genuine startup blob; on-device deployment
uses the firmware-matched `V8_MKSNAPSHOT` toolchain (procedure in *Testing `--snapshot`
on a webOS board*).

### Validation

Both paths are validated against real apps — **Sandstone**
(`samples/sandstone/tutorial-hello-enact`, React 18, pre-compiled deps) and
**Limestone** (`samples/limestone/tutorial-hello-enact`, React 19, which ships
**raw `@enact` source** with JSX-in-`.js` and uses `~` npm imports — the harder,
more representative case):

- **`enact pack -p --vite`** → succeeds on both. 
- **`enact serve --vite`** → succeeds on both. 
- **iLib i18n runtime** validated (constants baked/defined, locale data
  copied/served); **locale filtering** `-l en-US,ko-KR` trims 70 MB → 19 MB
  (correct locales); **webOS meta** `appinfo.json` + icons
  emitted/served; **ESLint** lints the sources (clean) and enforces rules.
- **Real-browser render** verified on several apps:`qa-dropdown` (nested
  `@enact`), the redux sample (webpack HMR API), and the aggregated `all-samples`

### Config details handled

The non-obvious parts of the port (all in `config/vite.config.js` unless noted):

1. **ESM must be preserved for Rollup.** `babel-preset-enact`'s `@babel/preset-env`
   uses `modules: 'auto'`, which emits **CommonJS** unless the caller advertises
   ESM support. `babel-loader` sets this; `@vitejs/plugin-react` does **not**, so
   the config passes `babel.caller = { supportsStaticESM: true, … }`.
2. **PostCSS plugins are instances.** Vite's `css.postcss.plugins` wants
   instantiated plugins, not string names — `require()` + invoke each (`loadPostCss`).
3. **`cssModuleIdent` loader context + CSS-safe names.** It reads
   `context.rootContext` (for the hash), so the config passes
   `{resourcePath, rootContext: app.context}`. For **nested** `@enact` deps the
   derived readable name would embed a literal `@`, invalid unescaped in a CSS class
   selector, so the ident is sanitized to `[A-Za-z0-9_-]` (the trailing hash keeps
   it unique). (Webpack sidesteps this with short hashes in production; this config
   uses readable names in both modes.)
4. **JSX-in-`.js` for the dev scanner.** esbuild's dep scanner defaults `.js` to
   the `js` loader and can't parse Enact's JSX-in-`.js`:
   `optimizeDeps.esbuildOptions.loader = { '.js': 'jsx' }`.
5. **iLib non-browser loaders** (see item 1 in *webOS-specific features*) would break
   both the Rollup build and the esbuild optimizer; a shared `ILIB_LOADER_RE`
   neutralizes them via `build.commonjsOptions.ignore` and an esbuild stub plugin.
6. **`@enact/*` deps ship raw source.** `@enact/*` is distributed unbuilt (`main`
   points at `src/`): JSX-in-`.js`, ESM, decorators, and Babel proposals like
   `export default from 'ilib'`. It is transpiled like app code (webpack does this
   via `exclude: /node_modules.(?!@enact)/`). Two mechanisms, because build and dev
   pre-bundler use different engines: (a) the react plugin's
   `exclude: /[\\/]node_modules[\\/](?!@enact[\\/])/` so babel-preset-enact runs on
   `@enact/*`; (b) an `optimizeDeps` esbuild plugin (`enact-babel-optimize`) runs
   babel-preset-enact on `@enact/*` source (ESM-preserving) before esbuild
   pre-bundles it (esbuild can't parse the raw syntax, e.g. `export default from`).
7. **LESS/CSS `~` npm imports.** A custom Less `FileManager`
   (`lessTildeImportPlugin`) for LESS `@import`s, plus a `resolve.alias`
   `{find: /^~/, replacement: ''}` for plain CSS `@import`s.
8. **`~` in `@import-json` rules.** Ported as `tildeJsonImportPlugin`, resolving `~`
   before `@daltontan/postcss-import-json`.

## webpack → Vite mapping

| Concern | webpack | Vite |
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
| HTML document (no `index.html` in Enact apps) | `HtmlWebpackPlugin` + `.ejs` | `ViteHtmlPlugin` renders the same template; serves it in dev, emits `index.html` (entry + CSS) in build |
| Polyfills first | `entry: [polyfills, appMain]` | generated combined entry (`node_modules/.cache/enact-vite/index.js`) |
| **iLib i18n runtime** (`ILIB_*` constants + locale/resource data) | `ILibPlugin` | `ViteILibPlugin` — defines the constants (build + dev-optimizer) and copies (build) / serves (dev) the data |
| **iLib locale filtering** (`-l used/tv/signage/all/list`) | via isomorphic/prerender flow | `ViteILibPlugin` `locales` option — trims the emitted/served manifest to requested locales + shared data |
| **webOS metadata** (`appinfo.json` + icons, localized appinfo) | `WebOSMetaPlugin` | `ViteWebOSMetaPlugin` — emits (build) / serves (dev) appinfo + assets; title fallback |
| **ESLint** (`eslint-config-enact`, `--no-linting`) | `eslint-webpack-plugin` | inline `enact-eslint` plugin — lints at build start; errors fail the build, dev warns |
| Source maps | `devtool` | `build.sourcemap` / `css.devSourcemap` |

## webOS-specific features and how they're implemented

Items 1–6 correspond to `@enact/dev-utils` webpack plugins that tap the
`compiler`/`compilation` lifecycle; items 7–9 are webpack loader/config behaviors.

1. **iLib runtime (`ILibPlugin`)** → **`ViteILibPlugin`**
   ([`dev-utils/plugins/ViteILibPlugin`](../../dev-utils/plugins/ViteILibPlugin)).
   `@enact/i18n`'s runtime `Loader.js` is bundler-agnostic (XHR from the `ILIB_*`
   constants), so the Vite plugin defines those constants (build **and** the dev
   dep-optimizer, via `optimizeDeps.esbuildOptions.define`) and makes the data
   available — copying the iLib `locale/` + app/theme `resources/` trees on
   `writeBundle` (build) and serving them from source via middleware (dev).
   Non-browser iLib loaders are neutralized separately (`ILIB_LOADER_RE`).
   **Locale filtering** is supported via the `locales` option — `-l en-US,ko-KR`
   trims 70 MB → 19 MB (6,755 → 1,988 files) and emits a trimmed manifest.
2. **webOS metadata (`WebOSMetaPlugin`)** → **`ViteWebOSMetaPlugin`**
   ([`dev-utils/plugins/ViteWebOSMetaPlugin`](../../dev-utils/plugins/ViteWebOSMetaPlugin)).
   Discovers the root `appinfo.json` (root or `./webos-meta/`) + localized
   `resources/**/appinfo.json`, emits them and their referenced icon/splash assets
   (build: `writeBundle` copy; dev: middleware), and supplies the `<title>`
   fallback via `ViteWebOSMetaPlugin.readTitle`. `$`-prefixed sys-assets
   (`$icon.png` → `sys-assets/<spec>/icon.png`, emitted per-spec preserving the
   layout, appinfo value left untouched) are handled — matching the webpack plugin.
3. **Isomorphic prerendering (`PrerenderPlugin` + isomorphic mixin)** →
   **`mixins/vite-isomorphic.js`** + `pack.js` `viteIsomorphic`. Uses a real
   **`vite build --ssr`** of the app entry, then per-locale server render
   (`FileXHR` for iLib locale data, no DOM shim needed) + assembly into the
   webpack-compatible output (fallback `index.html` + deduped `index.<variant>.html`
   + `locale-map.json` + per-locale webOS `appinfo.json`), reusing the
   bundler-agnostic `templates.js`/`FileXHR`. Browser-validated end-to-end on
   qa-a11y (`-p -i -l en-US,ko-KR`): prerendered markup hydrates with no console
   warnings in the production build. (A dev build shows two dev-only React warnings
   that are by-design in `@enact/i18n` — locale class deferred to the client — and
   identical to webpack's isomorphic output, including with `--externals`; `-p`
   strips them.) Full detail in
   [`vite-isomorphic-scope.md`](./vite-isomorphic-scope.md).
4. **V8 snapshot (`SnapshotPlugin`)** → **`mixins/vite-snapshot.js`**. `--snapshot`
   (which implies `--isomorphic`) builds the client as a **self-contained UMD**
   `main.js` (`output.format:'umd'`, `name:'App'`, `preserveEntrySignatures:'strict'`,
   `inlineDynamicImports`) with a `global` banner for the bare-V8 context, exposing
   the app's default export as the `App` global — mirroring webpack's
   `output.library='App'`/`libraryTarget='umd'`. The snapshot helpers are ESM
   ([`snapshot-helper-esm.js`](../../dev-utils/plugins/SnapshotPlugin/snapshot-helper-esm.js)
   + [`snapshot-mock.js`](../../dev-utils/plugins/SnapshotPlugin/snapshot-mock.js),
   reusing `mock-window.js` + `@enact/core/snapshot`): import order deterministically
   installs the mock window before `react-dom/client` loads (Rollup hoists CJS
   requires, so the original CJS helper's in-line ordering can't be reproduced), and
   `global.updateEnvironment` is defined for the on-device window rebind. A resolver
   redirects `react-dom/client` → the facade and no-ops absent optional deps (`fbjs`
   is gone in React 19; a theme may lack `internal/$L`). After the isomorphic
   prerender/assembly (startup script kept **classic**, since `main.js` is UMD),
   `mksnapshot` (`V8_MKSNAPSHOT`) runs against `main.js` to emit `snapshot_blob.bin`
   and tag `appinfo.json` `v8SnapshotFile`.

   Against `mksnapshot` (V8) the UMD bundle produces a genuine, non-zero startup blob
   (qa-a11y: **4.6 MB**, in line with the ~4.3 MB webpack reference). The syntax must
   parse in the target board's V8; the app's browserslist drives the output by
   default, and `V8_SNAPSHOT_TARGET` force-lowers it for firmware older than the app
   targets. `--snapshot --externals` is unsupported (the snapshot must embed
   `@enact`), matching webpack.

   **core-js in the snapshot: parity with webpack.** core-js is included by default
   (as in the webpack path). Its WeakMap-based internal state serializes fine on a
   **modern** snapshot V8, but a **very old** one (~Chrome 53) can't serialize a
   WeakMap-with-entries — `mksnapshot` throws `illegal access` → 0-byte blob. This is
   a **core-js-3 + old-V8 limitation, not a bundler difference**, measured on the
   *same* `mksnapshot.53` against qa-a11y built at `chrome 53`:

   | Bundle (chrome 53 target, core-js 3.22.8) | Result |
   | --- | --- |
   | **webpack** + core-js | `illegal access` → 0-byte blob |
   | **Vite** + core-js | `illegal access` → 0-byte blob (identical) |
   | **Vite**, `ENACT_SNAPSHOT_NO_COREJS=1` | 4.6 MB blob |

   webpack and Vite behave identically; Vite additionally offers
   `ENACT_SNAPSHOT_NO_COREJS` to still emit a blob (minus runtime builtin polyfills)
   on such old firmware, where webpack emits nothing. On a firmware-matched **modern**
   `mksnapshot` (e.g. Chrome 132) neither the `V8_SNAPSHOT_TARGET` lowering nor the
   no-core-js opt-out is needed — the default build is correct for both bundlers.
5. **Framework externals** → **`mixins/vite-framework.js`** + `pack.js`
   `--framework`/`--externals`. Webpack's DLL maps deep module requests to IDs in a
   prebuilt bundle via a manifest; the Vite analog is a shared framework ESM build
   addressed by an **import map** (exact keys per specifier, from a manifest), with
   `build.rollupOptions.external` on the app build. Browser-validated end-to-end on
   limestone/qa-a11y: 138-specifier framework + `enact.css`, app externalizes 60
   specifiers, boots fully styled with a single React instance, console clean.
6. **`GracefulFsPlugin`** — patches webpack's output FS to avoid EMFILE. Not needed
   under Vite (different FS handling); intentionally not ported.
7. **Node polyfills (`node-polyfill-webpack-plugin`)** → **`vite-plugin-node-polyfills`**.
   `global` is supplied by `ViteHtmlPlugin`'s head shim and `process.env.NODE_ENV`
   by `define`; fuller coverage (`Buffer`, full `process`, and the node builtin
   modules) is wired via `vite-plugin-node-polyfills`, gated to browser targets.
   Globals are injected **reference-only** (like webpack's `ProvidePlugin` — no
   global `typeof process` flip, no bundle bloat when unused; qa-a11y doesn't bundle
   `buffer` and exposes no `window.Buffer`/`process`). A small
   `enact-node-polyfill-resolver` `resolveId` plugin resolves the injected shim
   specifiers from the CLI's `node_modules`, since apps are built with
   `root: app.context`. For the SSR/isomorphic build, `vite-isomorphic.js`'s
   `applySsrBuild` drops these plugins so the Node bundle uses the real builtins
   (`path`/`fs`/`crypto`).
8. **`icss` mode for non-`*.module` CSS / `forceCSSModules`.** The Enact
   `forceCSSModules` option (scope ALL css/less/scss, not just `*.module.*`) is
   wired via `enactForceCSSModulesPlugin` in `config/vite.config.js`. Vite decides
   module-ness only from the `.module.` filename infix (`cssModuleRE`) with no
   override hook, so the plugin resolves each non-module style import and redirects
   it to a **virtual `.module` id** — keeping the real directory so LESS
   `@import`/`url()` still resolve, serving the real file via `load`, and letting
   `generateScopedName` recover the real path for webpack-parity hashing. Non-module
   CSS and LESS scope and export a class map, matching webpack's ident
   (`src_App_App_app__<hash>`).

   The default path (option off) matches webpack's `mode:'icss'`: css-loader in
   `icss` mode leaves class names global but still emits a **default export** (the
   ICSS `:export` locals, usually `{}`). Vite emits *no* default export for plain
   CSS, so the classic Enact idiom on a **non-module** stylesheet —
   ```js
   import css from './App.less';        // plain .less, global classes
   kind({styles: {css, className: 'app'}});
   ```
   would otherwise be a build error (`"default" is not exported`). Parity is provided
   by `enactICSSInteropPlugins()` **without scoping anything**: `enact-icss-extract`
   lifts `:export {…}` blocks into a locals map and strips them from the emitted CSS
   (as css-loader does); `enact-icss-default-export` (`enforce:'post'`) appends
   `export default <locals>` when the proxy has none. Verified against webpack on
   `qa-i18n`: both bundlers emit identical `styles:{css:{brandColor:"#ff0000"},className:"app"}`,
   keep `.app` global, and strip `:export`. `*.module.*` files are untouched.
9. **LESS/CSS `~` npm imports** — resolved by config items 7 and 8 in the *Config
   details handled* list: `lessTildeImportPlugin` (LESS), `resolve.alias /^~/` (CSS),
   and `tildeJsonImportPlugin` (`@import-json`).

## Command wiring

`commands/pack.js` and `commands/serve.js` branch to the Vite path when opted into via
**`--vite`** or **`ENACT_BUNDLER=vite`**; otherwise webpack runs unchanged.

- `enact serve --vite` → `vite.createServer(...).listen()` (native ESM dev server, HMR via `@vitejs/plugin-react`).
- `enact pack --vite` / `enact pack -p --vite` → `vite.build(...)` (supports `--watch`, `-o/--output`, `--content-hash`, `--no-split-css`, `-l/--locales`, `--no-linting`, `--entry`).
- Build-shaping flags via **`mixins.applyVite`** (the Vite counterpart to the webpack
  `mixins.apply`, in `dev-utils/mixins/vite.js`):
  - `--stats` → static bundle-analysis treemap `dist/stats.html`
    (`rollup-plugin-visualizer`, mirroring webpack's `webpack-bundle-analyzer`).
  - `--verbose` → raises Vite's log level and narrates build phases with a module
    count (no percentage — Rollup has no fixed total up front).
  - `--no-minify` (private) → Terser with `mangle:false` + beautify, keeping dead-code
    removal (mirrors the webpack `unmangled` mixin). Production builds only.
- `enact eject --vite` wires the ejected app's scripts to the Vite path (see
  [vite-eject-testing.md](vite-eject-testing.md)).
- **`--framework` / `--externals`** via **`mixins/vite-framework.js`**: `--framework`
  builds the shared `@enact`+react+ilib bundle as reusable ESM + a specifier manifest +
  one `enact.css`; `--externals=<path>` externalizes those specifiers from the app build
  and injects an import map (+ the shared stylesheet) resolved from the manifest.
  `--externals-public` sets the import-map base URL (remote framework path).
- **`--isomorphic`** via **`mixins/vite-isomorphic.js`** + `pack.js`'s `viteIsomorphic`
  (client `hydrateRoot` build + `vite build --ssr` + per-locale prerender +
  webpack-compatible HTML/`locale-map.json`/`appinfo.json` assembly).
- **`--snapshot`** via **`mixins/vite-snapshot.js`** (see item 4 above); emits the blob
  when `V8_MKSNAPSHOT` is set and prints a skip notice otherwise (the app still builds
  and runs without the snapshot).

The reusable bundler plugins live in `@enact/dev-utils` — mirroring the webpack plugins
(`ILibPlugin`, `WebOSMetaPlugin`, …) — and are consumed by `config/vite.config.js`:
[`ViteHtmlPlugin`](../../dev-utils/plugins/ViteHtmlPlugin),
[`ViteILibPlugin`](../../dev-utils/plugins/ViteILibPlugin), and
[`ViteWebOSMetaPlugin`](../../dev-utils/plugins/ViteWebOSMetaPlugin). The config-level
pieces (PostCSS chain incl. `~`/JSON-import handling, LESS `modifyVars`, the ESLint
plugin) stay in `cli/config`, matching where `getStyleLoaders`/the eslint config live
for webpack.

## Try it

```bash
cd cli
npm install                     # pulls in vite + @vitejs/plugin-react + terser
# from an Enact app dir:
enact serve --vite                   # or: ENACT_BUNDLER=vite enact serve
enact pack -p --vite                 # production build (full iLib data)
enact pack -p --vite -l en-US,ko-KR  # production build, locale-filtered
```

> Node 20+ is required for `require()` of the ESM-only `vite` package (validated on
> Node 24).
