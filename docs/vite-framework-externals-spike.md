# Vite `--framework` / `--externals` — spike findings & plan

**Status: spike complete, mechanism proven in-browser.** This documents what the
webpack feature does, the Vite-native approach, what the spike validated end-to-end,
and the plan to turn it into `enact pack --framework` / `--externals`.

## What the webpack feature does

A DLL-style shared bundle so multiple webOS apps share one framework payload on-device.

- **`pack --framework`** ([dev-utils `mixins/framework.js`](../../dev-utils/mixins/framework.js) +
  [`EnactFrameworkPlugin`](../../dev-utils/plugins/dll/EnactFrameworkPlugin.js)) — bundles every
  `@enact/**` + all `ilib/**` + `react`/`react-dom`/`react-dom/client`/`react-dom/server`
  into a UMD library `enact_framework`, where each module is addressable by a **normalized
  ID** (`@enact/ui/Button`, `react`, `ilib`) through a `__webpack_require__` registry.
  Emits `enact.js` + `enact.css`.
- **`pack --externals=<path>`** ([`mixins/externals.js`](../../dev-utils/mixins/externals.js) +
  [`EnactFrameworkRefPlugin`](../../dev-utils/plugins/dll/EnactFrameworkRefPlugin.js)) — a
  `DelegatedEnactFactoryPlugin` rewrites every `@enact`/`react`/`ilib` request into
  `enact_framework('<id>')`, and injects `<script src=.../enact.js>` before the app's assets.

The hard part: webpack maps **deep module IDs** through a runtime registry. Rollup's
`external` works at the *specifier* level and has no such registry.

## The Vite-native approach: import maps

The browser-native analog to the DLL registry is an **import map**, which supports
prefix mapping via trailing-slash keys (`"@enact/ui/": "/framework/@enact/ui/"`).

- **Framework build** = a Vite build that emits the shared deps as reusable ESM files.
- **App build** = the normal app build with those specifiers in
  `build.rollupOptions.external`, plus an injected `<script type="importmap">` that maps
  each bare specifier to its framework file.

## What the spike validated (qa-a11y, react/react-dom externalized)

Two throwaway scripts drove the real CLI vite.config factory unchanged. **Browser-verified**
against `limestone/samples/qa-a11y`:

1. **Framework bundle builds as reusable ESM with working named exports.** `react.js` loaded
   as ESM exposes `useState`/`useEffect`/`createElement`/… (v19.2.6). Two non-obvious fixes
   were required and found:
   - **Re-export wrapper per specifier**, not the CJS file as the entry directly (a bare CJS
     entry just runs `requireReact()` and exports nothing).
   - **`preserveEntrySignatures: 'strict'`** — otherwise Rollup tree-shakes the entry's
     re-exports off (nothing imports an entry), leaving a bare require call.
   - **Enumerate export names at build time** (`Object.keys(require('react'))`) to generate
     explicit `export const { … } = __m`. React 19's lazy-CJS pattern defeats Rollup's static
     named-export detection, so `export *` yields nothing; enumeration is deterministic and
     version-proof (44 names for react, 3 for jsx-runtime, etc.).
2. **Single React instance.** `react.js` and `react-dom-client.js` both import the same
   shared `chunk-index.js` (react core) — so react-dom uses the same React. Confirmed in the
   network trace (react core chunk fetched once) and, decisively, by the app **rendering with
   hooks working** — two React copies would throw "Invalid hook call" and render nothing.
3. **App externalizes + boots against the import map.** The app `main.js` contains bare
   `import … from "react"` / `"react-dom"` / `"react-dom/client"` / `"react/jsx-runtime"`
   (react excluded from the bundle). The injected import map (first element in `<head>`,
   before the module script) resolves them to `./framework/*.js`. The qa-a11y sample rendered
   fully, **console clean, no 404s**.

## Deep-import coverage — proven (extended spike)

The extended spike (`build-fw-app.mjs`) took the react-only proof to the **full @enact
surface** on qa-a11y, reusing the real CLI vite.config factory for both builds. **Browser-
verified**: all **60** `@enact/*` + react specifiers externalized, app `main.js` shrank to
**236 KB** (from ~1.08 MB), framework = 175 shared ESM chunks + one `enact.css`, app renders
**fully styled** (4808 CSS rules applied), console clean, every framework chunk 200 OK.

Three non-obvious findings resolved:

1. **Exact import-map keys, not prefix.** `@enact/limestone/Button` resolves via the
   component dir's `package.json` `main` (`Button/Button.js`) — which browser import maps
   can't do. So the map needs one **exact** key per specifier. These are collected from the
   app build (an `external(id)` function records each externalized specifier); since
   externalized modules aren't crawled, the set is bounded (the app's *direct* imports), and
   the framework build pulls in all transitive `@enact`/react/ilib internally as shared chunks.
2. **Wrapper entries are mandatory — never point an entry at @enact source directly.** Making
   `@enact/i18n/I18nDecorator` an *entry* breaks Vite's CJS interop for @enact's CJS-in-source
   (e.g. `i18n/src/zoneinfo.js` → `"default" is not exported`), because @enact is symlinked
   monorepo source *outside* `node_modules` (with `preserveSymlinks`), so the commonjs plugin
   skips it. Routing every entry through a small re-export **wrapper** keeps the real module
   *transitive* (exactly as a normal app build sees it), and the error disappears. Wrapper
   shapes: CJS (react/ilib) → enumerate named exports; @enact ESM → `export * from …` +
   `export default (__m.default !== undefined ? __m.default : __m)` (safe default fallback).
3. **Single `enact.css`.** Per-chunk CSS can't be loaded via an import map (JS only), so the
   framework build sets `build.cssCodeSplit = false` → one `enact.css`, injected as a `<link>`
   before the app's own stylesheet. ilib needed no extra work — the factory's existing
   `ILIB_LOADER_RE` commonjs-ignore handled it.

## CLI wiring — implemented (shared-framework model)

Wired and **browser-validated end-to-end** via the CLI on limestone/qa-a11y
(`enact pack --framework -o framework-dist` then `enact pack --externals=framework-dist`):
the 138-specifier framework + `enact.css` built, the app externalized 60 specifiers,
booted **fully styled** (5032 CSS rules), single React instance, console clean.

Implementation:

- **`dev-utils/mixins/vite-framework.js`** — mirrors the webpack DLL `framework`/`externals`
  mixins. `enumerateSpecifiers(context)` globs the shared surface (every `@enact/<pkg>`
  root + component subpath, plus react family + ilib) independent of any app;
  `writeWrappers` emits re-export wrappers; `applyFramework` sets
  `preserveEntrySignatures:'strict'` + `cssCodeSplit:false` and drops the HTML/webOS-meta
  plugins; `writeManifest`/`readManifest` persist the specifier→file map; `applyExternals`
  externalizes + collects; `injectHtml` writes the import map + stylesheet `<link>`.
- **`pack.js`** — `--framework` runs `viteFramework()` (build + manifest); `--externals=<path>`
  runs the app build with externalization, then resolves collected specifiers against the
  manifest and injects the map (copying the framework under `./framework`, or using
  `--externals-public` as the base URL for a remotely-deployed framework).

### Remaining refinements (non-blocking)

- **Theme-repo `.` self-inclusion** — webpack's `--framework` in a *theme* repo (limestone)
  includes the theme's own components via `libraries.push('.')`. The current enumeration
  scans `node_modules/@enact`, so build the framework in a context where all `@enact`
  *including the theme* are installed (an app/sample context works; qa-a11y gave 138
  specifiers incl. limestone). Adding theme-self globbing would let it run in the bare theme repo.
- **`--snapshot`** interaction — deferred until `--snapshot` itself is ported.

### `--externals-polyfill` — wired

`pack --framework --externals-polyfill` adds `core-js/stable` as a framework entry (a
side-effect wrapper; folds all core-js into the shared bundle, manifest key `core-js/stable`).
`pack --externals=<path> --externals-polyfill` then externalizes core-js out of the app:
because the app config *aliases* `core-js` to the CLI's copy (so the `external` fn only sees
488 resolved internals, never the bare specifier), the externals path **drops that alias** so
`core-js/stable` stays a bare specifier and externalizes as one unit → the ~488 core-js
modules leave the app bundle and resolve to the framework via the import map. Externalization
is **manifest-aware**, so core-js (and any @enact the framework doesn't provide) is only
externalized when the framework actually carries it — otherwise it stays bundled and the app
still builds. Browser-unverified but bundle-verified: with the flag, core-js internals are
absent from `main.js` and `core-js/stable` appears in the import map; without it, core-js
stays in the app.

## Risk assessment

**All technical risk is retired and the feature is implemented + browser-validated.** The
refinements above are optional polish, not blockers.
