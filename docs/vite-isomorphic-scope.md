# Scope: `--isomorphic` prerendering for the Vite path

Port of the webpack `PrerenderPlugin` + `mixins/isomorphic.js` to the Vite
bundler path (`enact pack --isomorphic --vite`). This is the largest remaining
webpack-only feature; this doc breaks it into buildable phases with the concrete
mechanics, risks, and a validation plan.

## Goal

`enact pack -p -i --vite` should, for each target locale (`-l`), server-render the
app to static HTML and produce per-locale `index.<locale>.html` files plus a
startup script that (a) shows the prerendered markup immediately and (b) hydrates
on the client — matching the webpack output closely enough that webOS treats it as
a prerendered app (`appinfo.usePrerendering = true`, per-locale `main`).

## What webpack does today (reference)

Files: [`dev-utils/mixins/isomorphic.js`](../../dev-utils/mixins/isomorphic.js),
[`dev-utils/plugins/PrerenderPlugin/`](../../dev-utils/plugins/PrerenderPlugin/)
(`index.js`, `vdom-server-render.js`, `FileXHR.js`, `templates.js`).

1. **Build shape** — the app is built as a **UMD library** (`output.library='App'`,
   `libraryTarget='umd'`, `globalObject='this'`) whose `default` export is the app
   ReactElement. `src/index.js` already exports `appElement` as default and guards
   `createRoot`/`hydrateRoot` behind `typeof window` + `ENACT_PACK_ISOMORPHIC`.
   React is exposed on `global` (`expose-loader`) to avoid duplicate copies.
2. **Server render** (`vdom-server-render.render`, per locale):
   - `global.XMLHttpRequest = FileXHR` — a synchronous fake XHR that reads iLib
     locale data from **disk** so `@enact/i18n` can load it during SSR.
   - `global.process.env.LANG = locale`.
   - `require()` the built UMD chunk in Node → `chunk.default` = the element.
   - `reactDOMServer.renderToString(chunk.default)`.
   - Optional per-locale font CSS via `app.fontGenerator`, prepended to the markup.
3. **HTML assembly** (`PrerenderPlugin` html hooks + `templates.js`):
   - Root CSS classes (`enact-locale-*`) are extracted from the rendered markup.
   - Identical renders across locales are **deduped/aliased** (`simplifyAliases`).
   - JS `<script>`s are removed from `<body>` and replaced by an inline
     **startup script** (`templates.startup`) in `<head>` that async-loads the JS
     and, at runtime, picks the correct prerendered HTML for the device
     screenType/locale.
   - Emits `index.html` + `index.<locale>.html` variants.
4. **webOS meta coupling** — generates per-locale `resources/<locale>/appinfo.json`
   with `main: index.<locale>.html`, and sets root `usePrerendering: true`.

## Proposed Vite architecture

Vite has first-class SSR, which replaces the UMD-in-Node approach cleanly. The
**key correction** from the spike: do a real **`vite build --ssr`** of a server
entry (full plugin/babel pipeline runs) — do **not** use dev-time `ssrLoadModule`
(which skipped the JSX-in-`.js` transform and failed at `App.js`).

Pipeline for `pack --isomorphic --vite`:

1. **Client build** (existing) → `main.js`, `main.css`, assets. Keep the current
   `ViteHtmlPlugin` output as the hydration shell.
2. **SSR build** — a second Rollup build (`build.ssr = <server entry>`,
   `ssr.noExternal` for `@enact/*`) producing a Node-loadable `app.server.js`
   whose default export is the app element. Server entry ≈ `export {default} from
   '<app main>'` (the app already exports the element; the `window` guard keeps the
   client render side-effect from firing under SSR).
3. **Prerender driver** (new, run after both builds in `pack.js`'s `viteBuild`):
   for each locale from `parseLocales` (already ported in `ViteILibPlugin`):
   - set `global.XMLHttpRequest = FileXHR`, `process.env.LANG = locale`;
   - `require(app.server.js)` fresh (uncached) → element;
   - `renderToString`; extract `enact-locale-*` classes; dedupe/alias.
4. **HTML emit** — inject the prerendered markup into `<div id="root">…</div>` of
   the client `index.html`, add the startup `<script>` in `<head>`, remove the
   body module script (startup adds it), and write `index.<locale>.html`.
5. **webOS meta** — extend `ViteWebOSMetaPlugin` to accept a locale list +
   `usePrerendering` and emit per-locale `appinfo.json` with `main`.

Reusable as-is from `@enact/dev-utils`: `FileXHR.js`, `templates.js`,
`parseLocales`/`detectLocales` (now in `ViteILibPlugin`), the alias/dedupe logic
(`simplifyAliases`, `rootInjection`, `language`). These are **bundler-agnostic** —
only the webpack-runtime string rewrites in `vdom-server-render.stage`
(`__webpack_require__.e`, `webpackAsyncContext`) are webpack-specific and get
dropped (Vite's SSR bundle has no such runtime).

## Phase A — validated (GO)

A timeboxed spike (`vite build --ssr` of `qa-a11y/src/index.js` reusing the CLI vite.config
factory, then load + `renderToString` for `en-US`) **passed the go/no-go gate**: the app
server-rendered to **68 KB of non-empty markup** with Enact root classes
(`enact-orientation-landscape enact-res-fhd … limestone-theme … ThemeDecorator_root`),
default export a valid React element, no throw.

Concrete findings (the Phase A "how"):

1. **Real `vite build --ssr`, not `ssrLoadModule`** — confirmed: the JSX-in-`.js` transform
   runs and `@enact/*` (in `ssr.noExternal`) is bundled + babel-transformed.
2. **CJS output** (`output.format='cjs'` + `inlineDynamicImports`) — the bundle carries
   leftover `require()` (ilib's platform loaders); an ESM (`.mjs`) bundle throws
   `require is not defined`. Load it with `require()` in the prerender driver.
3. **ilib: bundle it + keep the *Node* loader.** The client config ignores **all** ilib
   platform loaders (`ILIB_LOADER_RE`) because the browser can't use them; for SSR-in-Node,
   override `commonjsOptions.ignore` to keep `NodeLoader`/`ilib-node.js` (ignore only
   Qt/Rhino/Ringo) so ilib reads locale data from disk. Also add `/^ilib($|\/)/` to
   `ssr.noExternal` (externalized, its internal dynamic imports resolve to a wrong path).
4. **No `window`/DOM shim needed.** Enact renders server-side without a DOM (matches webpack's
   `vdom-server-render`, which sets only `XMLHttpRequest=FileXHR` + `LANG`, never `window`).

## Phase B — validated (prerender driver + FileXHR); scope-doc criterion corrected

The prerender driver (build SSR bundle once, then per-locale: set `FileXHR` global + `LANG`,
uncached-`require`, `renderToString`) works, and its output **matches the current webpack
`--isomorphic` baseline byte-for-byte modulo the CSS-module hash**.

Findings:

1. **FileXHR path shim — strip the leading `/`.** `@enact/i18n` builds **absolute** locale URLs
   (`/node_modules/ilib/locale/ilibmanifest.json`, `/resources/ilibmanifest.json`) because
   Vite's base is `/`. `FileXHR` reads relative to cwd (the app dir), so the driver wraps it to
   strip the leading `/` → both manifests resolve (200) from `node_modules/ilib/locale/…` and
   `resources/…`. (No `ILIB_BASE_PATH` gymnastics needed.)
2. **`enact-locale-*` is NOT emitted server-side — by design (scope-doc criterion was stale).**
   The current `@enact/i18n` `I18n.getServerSnapshot()` returns **`className: null`**
   deliberately; the locale class is applied on the **client** after hydration. Confirmed the
   current **webpack** `--isomorphic` produces the *same* thing: its prerendered
   `index.multi.html` has **no** `enact-locale-*` classes either. So "extract `enact-locale-*`
   root classes" (from the older webpack behavior this doc was written against) is obsolete —
   the correct success criterion is **"prerendered markup matches webpack's prerender."**
3. **Matches webpack exactly.** Vite `renderToString` → the same root as webpack's
   `index.multi.html`: `enact-orientation-landscape enact-res-fhd … ThemeDecorator_root__<hash>
   limestone-theme enact-unselectable enact-fit enact-text-normal` + identical panel content;
   only the CSS-module hash suffix differs (`__voIZO` vs `__tejPz`), as expected across bundlers.
4. **Identical-across-locales → dedupe.** For a no-translation app (qa-a11y), every locale
   renders identically, so webpack aliases them all to one file (`locale-map.json`:
   both `en-US`+`ko-KR` → `index.multi.html`). Vite's per-locale renders are likewise identical
   → the driver dedupes to one variant. (Apps with `$L` translations would render differently
   per locale and get separate variant files.)

Net: the render half of isomorphic is proven on Vite and output-compatible with webpack. What
remains (Phase C+) is pure **assembly** — reuse the bundler-agnostic `templates.js` /
`simplifyAliases` to emit the fallback `index.html`, the deduped `index.<variant>.html`, the
startup `<script>`, and `locale-map.json` — plus Phase D webOS per-locale `appinfo.json`.

## Work breakdown & effort

| Phase | Work | Effort | Risk |
| --- | --- | --- | --- |
| A | ~~SSR build wiring~~ **DONE** — `build.ssr` + CJS output + `ssr.noExternal` `@enact`/`ilib` + Node-loader-kept `commonjsOptions.ignore`; `renderToString` → 68 KB markup | ~~0.5–1 d~~ ✅ | ~~High~~ **retired** — no window shim needed |
| B | ~~Prerender driver~~ **DONE** — per-locale render + `FileXHR` (leading-`/` strip); output matches webpack. Dedupe/emit remains in C | ~~1 d~~ ✅ | ~~Med~~ resolved — render matches webpack byte-for-byte (modulo CSS hash) |
| C | ~~HTML assembly~~ **DONE (spike)** — dedupe + `templates.startup`/`update`, emit `index.html`/`index.multi.html`/`locale-map.json` (byte-identical to webpack) | ~~1 d~~ ✅ | resolved — reused `templates.js`; `main.js` loaded fine (see note) |
| D | ~~webOS-meta coupling~~ **DONE** — root `usePrerendering:true` + per-locale `resources/<lang>/<region>/appinfo.json` `main`→variant (`vite-isomorphic.writeAppinfo`) | ~~0.5 d~~ ✅ | resolved |
| E | ~~`fontGenerator` per-locale CSS; `--externals` interaction~~ **DONE** — `prerender` reads `app.fontGenerator` and prepends per-locale font CSS as a head-append block; `--isomorphic --externals` verified equivalent to plain `--isomorphic` (see below) | ~~0.5 d~~ ✅ | resolved |
| F | ~~Hydration check~~ **DONE** — the production `enact pack -p -i --vite` output hydrates in-browser with **no warnings/errors**; client applies `enact-locale-en` | ~~0.5 d~~ ✅ | resolved |

**Implemented and browser-validated end-to-end — all phases (A–F) done**, including per-locale
font CSS and `--isomorphic --externals` (verified equivalent to plain `--isomorphic`).

## Phase C + hydration — validated (spike)

The full pipeline (client build + SSR build + per-locale prerender + assembly) was driven
end-to-end and **browser-verified** on qa-a11y (`-l en-US,ko-KR`):

- **Output matches webpack byte-for-byte in shape:** emits `index.html` (2.6 KB, empty `#root` +
  inline `templates.startup` script, body module script removed), `index.multi.html` (71 KB,
  prerendered markup in `#root` + `templates.update` script), and `locale-map.json` **identical**
  to webpack's (`{fallback:'index.html', locales:{en-US→index.multi.html, ko-KR→index.multi.html}}`).
  Both locales deduped to one variant, reusing the bundler-agnostic `templates.js`.
- **Hydration is clean (production).** Loading `/index.multi.html` in a browser: the prerendered
  markup shows, the startup script loads `main.js`, the **production** (`-p`) output **React
  hydrates with zero console warnings/errors**, and the client then applies `enact-locale-en` to
  the root (matching the i18n design — null on the server, applied on the client). Note: a **dev**
  build surfaces two dev-only React warnings (`getServerSnapshot should be cached` + a root-class
  hydration mismatch) that are **by-design in `@enact/i18n`** (locale class deferred to the client)
  and identical to webpack's isomorphic output; `-p` strips both. See the `--externals` section below.

Notes for productionization (not blockers):
- `templates.startup`'s `appendScripts` adds `main.js` as a **classic** `<script>`; it worked
  here (qa-a11y's single production bundle has no top-level `import`), but for robustness the
  Vite path should mark it `type="module"` (Risk #3 — small `templates.startup` adapter).
- `screenTypes` was passed empty in the spike; wire limestone's real `screenTypes` (from the
  theme's RI config) so the startup script's resolution scaling matches webpack.

## Key risks / unknowns

1. ~~**SSR-safety of Enact components.**~~ **Resolved (Phase A)** — Limestone renders
   server-side with **no** DOM shim; matches webpack's DOM-less `vdom-server-render`.
2. ~~**`FileXHR` ↔ output layout.**~~ **Resolved (Phase B)** — wrap `FileXHR` to strip the
   leading `/` (Vite base `/`); locale manifests + data resolve from `node_modules/ilib/locale`
   and `resources/` relative to the app cwd.
3. **Startup script asset names.** `templates.startup` was written for webpack
   chunk names; Vite uses `main.js`/`chunk.*`/hashed. Needs a small adapter.
4. ~~**Hydration mismatch.**~~ **Resolved** — validated in-browser; the only mismatch is the
   by-design `@enact/i18n` locale-deferral (`className: null` server-side), identical to webpack
   and stripped in production. See the `--externals` section.
5. ~~**`--externals`** interplay~~ **Resolved (follow-on, now done)** — webpack's isomorphic +
   externals reroutes `require('enact_framework')` to the framework's `enact.js`; the Vite path
   instead bundles @enact for SSR while the client uses the framework import map, and the two are
   verified to produce identical hydration. See the `--isomorphic --externals` section.

## Validation plan

- ~~Phase A~~ **done**: SSR bundle `renderToString`s to non-empty markup (68 KB) matching
  webpack's prerender (note: `enact-locale-*` is **not** emitted server-side by the current
  i18n — that older criterion is obsolete; see Phase B).
- ~~Phase B~~ **done**: per-locale render via `FileXHR` (leading-`/` strip) → markup
  byte-identical to webpack's `index.multi.html` (modulo CSS hash).
- Phase C: `enact pack -p -i --vite -l en-US,ko-KR` → the fallback `index.html` (empty `#root`
  + startup script), the deduped `index.<variant>.html` with prerendered markup, and
  `locale-map.json` — matching the webpack `index.html`/`index.multi.html`/`locale-map.json` shape.
- Phase F: serve `dist/` and load in a browser — confirm markup shows pre-JS and
  React hydrates with **no hydration warnings** in the console; confirm locale
  switch works.

## Wired into the CLI — done

`--isomorphic` is implemented and browser-validated end-to-end:

- **`dev-utils/mixins/vite-isomorphic.js`** — `applySsrBuild` (client config → SSR build),
  `prerender` (per-locale render + `FileXHR` leading-`/` strip + `enact-locale-*` extract +
  dedupe), `assemble` (fallback `index.html` + deduped `index.<variant>.html` + `locale-map.json`
  via `templates.js`), `writeAppinfo` (root `usePrerendering` + per-locale appinfo `main`).
- **`pack.js`** — `viteIsomorphic(opts)`: client build (isomorphic → `hydrateRoot`) → SSR build →
  per-locale prerender → assemble → appinfo; branched from `viteBuild` when `opts.isomorphic`.
- **Validated:** `enact pack -p -i --vite -l en-US,ko-KR` on qa-a11y emits `index.html`,
  `index.multi.html`, `locale-map.json` (both locales → `index.multi.html`, matching webpack),
  root `appinfo.json usePrerendering:true`, and `resources/en/US`+`resources/ko/KR/appinfo.json`
  (`main:index.multi.html`). The **production** output hydrates in-browser with **no console
  warnings/errors** (dev builds show the by-design `@enact/i18n` locale-deferral warnings — see
  the `--externals` section).

Productionization — both wired + validated:
- **ESM startup script (done).** `assemble` rewrites `templates.startup`'s dynamically-appended
  script to `type="module"` (Vite emits ES modules; a single `main.js` module self-loads its
  chunks). Browser-confirmed: `main.js` loads as a module and hydrates cleanly — robust for
  code-split apps, unlike the classic `<script>` that only worked for a self-contained bundle.
- **Real screenTypes (done).** `pack.js` passes `app.screenTypes` (the resolved theme RI
  screen-type array, e.g. limestone's 9 entries) to `assemble`; browser-confirmed the startup
  script applied `enact-res-hd` from the real screenTypes (resolution scaling parity with webpack).
- **Phase E — per-locale font CSS (done).** `prerender` reads `app.fontGenerator`, calls
  `generator(locale)` + `fontOverrideGenerator(locale)` per locale, prepends the CSS as a
  head-append block (so it participates in dedupe); `assemble` extracts it into each variant's
  `<head>`. Browser-verified: limestone's `localized-fonts` `<style>` (with `@font-face`) lands
  in `index.multi.html`'s `<head>`.

### `--isomorphic --externals` — wired, works, no divergence from plain `--isomorphic`

The combination is wired (`viteIsomorphic`: the CLIENT build externalizes the framework +
injects the import map before assembly; the SSR build always bundles @enact to render). It
**builds and runs**: the app prerenders, is **styled** (the SSR prerender's CSS-module hashes
match the framework's `enact.css` — deterministic `cssModuleIdent`, verified `ThemeDecorator_root__voIZO`
== `enact.css`), loads @enact from the framework via the import map (205 files), and hydrates
with the locale applied.

**Verified equivalent to plain `--isomorphic` (2026-07).** An earlier note flagged an
`--externals`-only hydration mismatch as needing follow-up. That was a **measurement artifact**:
it compared a *production* plain build (React dev warnings stripped) against a framework whose
react-dom was a *development* build (warnings live). Rebuilt apples-to-apples — a **dev**
framework + dev `--isomorphic --externals` vs. a dev plain `--isomorphic`, both on qa-a11y
(`-l en-US,ko-KR`) — the two are **byte-identical**: same hydrated root className, and the
**same two dev-only warnings** on the **same** `<ThemeDecorator>` tree:

1. `The result of getServerSnapshot should be cached to avoid an infinite loop`
2. `A tree hydrated but some attributes … didn't match the client properties` (the root className).

Both are **inherent to @enact's isomorphic i18n design**, not to `--externals` and not to Vite:
`@enact/i18n`'s `I18n.getServerSnapshot()` deliberately returns `className: null` server-side and
the locale class (`enact-locale-*`) is applied on the **client** after hydration — so the first
client render legitimately differs from the server markup. **Webpack's isomorphic path has the
identical by-design mismatch** (same i18n source, same `getServerSnapshot`). React's production
build strips both dev-only warnings, so shipped output (`-p`) hydrates silently in every case.

Why webpack's SSR *looks* like it can't diverge: its prerender rewrites
`require('enact_framework')` → the framework's `enact.js` (`vdom-server-render.stage`), so one
@enact serves both SSR and client. The Vite path instead uses two @enact builds (SSR-bundled +
framework import map) — but because `cssModuleIdent` is deterministic on `resourcePath` +
`rootContext`, both builds emit **identical** CSS-module class names and identical root markup, so
the two-build approach produces the same hydration result as webpack's single-@enact approach.
**No caveat, no experimental flag** — `--isomorphic --externals` is production-correct.
