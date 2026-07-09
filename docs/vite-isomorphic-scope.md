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

## Work breakdown & effort

| Phase | Work | Effort | Risk |
| --- | --- | --- | --- |
| A | SSR build wiring (`build.ssr`, server entry, `ssr.noExternal` for `@enact/*`; confirm `default` = element renders) | ~0.5–1 d | **High** — Enact components touching `window`/`document` at import; may need a `window` shim before requiring the bundle |
| B | Prerender driver: per-locale loop, `FileXHR` global, uncached require, `renderToString`, class extraction, dedupe/alias (reuse `simplifyAliases`) | ~1 d | Med — memory/leaks across locales (webpack uses `--expose-gc`); FileXHR path assumptions vs. Vite output layout |
| C | HTML assembly: inject markup, startup script (`templates.startup`), per-locale `index.<locale>.html`, screenTypes wiring | ~1 d | Med — `templates.startup` assumes webpack asset naming; adapt to Vite `main.js`/hashed names |
| D | webOS-meta coupling: per-locale `appinfo.json` `main` + `usePrerendering`; extend `ViteWebOSMetaPlugin` | ~0.5 d | Low |
| E | `fontGenerator` per-locale CSS; `--externals` interaction (defer — depends on framework-externals port) | ~0.5 d | Med |
| F | Validation on limestone across locales + hydration check in browser | ~0.5 d | Med |

**Total: ~4–5 focused days.** Phase A is the go/no-go gate.

## Key risks / unknowns

1. **SSR-safety of Enact components.** The spike proved the transform issue is
   solved by a real SSR build, but not that Sandstone/Limestone render without a
   DOM. Webpack relies on the app being isomorphic-aware; some components may still
   need a `window`/`document` shim (jsdom or the webpack `mock-window`). **Validate
   in Phase A before committing to the rest.**
2. **`FileXHR` ↔ output layout.** `FileXHR` reads locale data from disk by URL
   path; it must resolve against the same paths `ViteILibPlugin` emits
   (`node_modules/ilib/locale/…`, trimmed manifest). Likely needs a base-path shim.
3. **Startup script asset names.** `templates.startup` was written for webpack
   chunk names; Vite uses `main.js`/`chunk.*`/hashed. Needs a small adapter.
4. **Hydration mismatch.** Client uses `hydrateRoot` when `ENACT_PACK_ISOMORPHIC`;
   the prerendered markup must match the client's first render (same locale, RI
   classes) or React warns/re-renders. Validate with real browser hydration.
5. **`--externals`** interplay: webpack's isomorphic + externals reroutes
   `require('enact_framework')`. This depends on the **framework-externals** port,
   so scope `--isomorphic --externals` as a follow-on, not part of this.

## Validation plan

- Phase A: a Node script that loads the SSR bundle and `renderToString`s the
  limestone app for `en-US` → non-empty markup with `enact-locale-*` root classes.
- Phase C: `enact pack -p -i --vite -l en-US,ko-KR` → `dist/index.html`,
  `index.en-US.html`, `index.ko-KR.html` each contain prerendered `#root` markup.
- Phase F: serve `dist/` and load in a browser — confirm markup shows pre-JS and
  React hydrates with **no hydration warnings** in the console; confirm locale
  switch works.

## Recommendation

Start with **Phase A as a timeboxed spike** (SSR build + single-locale
`renderToString` of limestone). If Enact renders server-side with at most a light
`window` shim, the rest is mechanical reuse of the existing bundler-agnostic
helpers. If it needs heavy DOM emulation, reassess whether isomorphic-under-Vite is
worth it vs. keeping `--isomorphic` on webpack indefinitely.
