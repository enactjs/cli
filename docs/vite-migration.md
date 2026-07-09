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
- **Real-browser render** verified on `qa-dropdown` (nested-`@enact` app): the
  app mounts and renders correctly (see runtime fixes below). Note: HTTP-200 /
  transform checks do **not** execute the page JS — always load a real browser.

Eight config issues plus three runtime issues were found and fixed while
validating. The runtime ones (only visible when the page actually executes in a
browser) were:

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

## What does NOT port yet (webpack-only, blocks a full swap)

These live in `@enact/dev-utils/plugins` and tap the webpack `compiler`/`compilation`
lifecycle. Each needs a bespoke Vite/Rollup plugin:

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
5. **Framework externals** (`EnactFrameworkPlugin` / `EnactFrameworkRefPlugin`,
   `mixins/framework.js`, `mixins/externals.js`) — DLL-style shared `@enact/*` +
   react framework bundle. *Effort: high — not ported.* Webpack's DLL maps module
   requests to IDs in a prebuilt bundle via a manifest; Rollup has no equivalent.
   A Vite port needs a two-build strategy (a UMD `enact_framework` lib build +
   `build.rollupOptions.external` in the app build) plus runtime linking of
   `@enact/*`/`react` to the external bundle (import map or UMD globals) — a real
   project, not validated here.
6. **`GracefulFsPlugin`** — patches webpack's output FS to avoid EMFILE. Not
   needed under Vite (different FS handling). *Drop.*
7. **`node-polyfill-webpack-plugin`** — Node builtin polyfills for screenshot
   tests. Vite: use `vite-plugin-node-polyfills` if required.
8. **`icss` mode for non-`*.module` CSS / `forceCSSModules`** — Vite auto-treats
   only `*.module.*` as modules; the webpack `mode: 'icss'` nuance and the global
   `forceCSSModules` toggle need a custom transform.
9. ~~**LESS/CSS `~` npm imports**~~ — **resolved** (fixes #7 and #8 above):
   `lessTildeImportPlugin` (LESS), `resolve.alias /^~/` (CSS), and
   `tildeJsonImportPlugin` (`@import-json`).

## Command wiring (applied, behind a flag)

`commands/pack.js` and `commands/serve.js` now branch to the Vite path when it is
opted into via **`--vite`** or **`ENACT_BUNDLER=vite`**; otherwise webpack runs
unchanged. Both bundlers coexist during migration.

- `enact serve --vite` → `vite.createServer(...).listen()` (native ESM dev server, HMR via `@vitejs/plugin-react`).
- `enact pack --vite` / `enact pack -p --vite` → `vite.build(...)` (supports `--watch`, `-o/--output`, `--content-hash`, `--no-split-css`, `-l/--locales`, `--no-linting`).
- Webpack-only flags on the Vite path (`--isomorphic`, `--snapshot`, framework/externals) print a "not yet supported, ignored" notice.

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

- **`--isomorphic`** prerendering, **`--snapshot`**, and **framework externals** —
  see gaps #3–#5 above. Each is a substantial project (not a config tweak); the
  Vite path prints a "not yet supported, ignored" notice for these flags.
- **`icss` mode / `forceCSSModules`** (gap #8): Vite treats only `*.module.*` as
  CSS modules; the webpack `mode: 'icss'` nuance isn't replicated.

## Recommendation

Adopt Vite behind a feature flag for the **browser dev/build** path first (biggest
DX win, lowest risk) — now validated end-to-end including i18n runtime, locale
filtering, webOS metadata, and ESLint. Keep webpack as the default for
`--isomorphic`, `--snapshot`, and framework-externals builds; those three are the
remaining work and each warrants its own focused effort (isomorphic first, as it's
the most-used; snapshot last, as it needs the webOS mksnapshot toolchain to even
validate).
