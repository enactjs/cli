# `--isomorphic` prerendering on the Vite path

`enact pack -p -i --vite` server-renders the app to static HTML per target locale
(`-l`), producing per-locale variant files plus a startup script that shows the
prerendered markup immediately and hydrates on the client — matching the webpack output
closely enough that webOS treats it as a prerendered app (`appinfo.usePrerendering = true`,
per-locale `main`).

This document describes how that path is implemented and how it maps to (and reuses) the
webpack machinery. Implementation:
[`dev-utils/mixins/vite-isomorphic.js`](../../dev-utils/mixins/vite-isomorphic.js) +
`pack.js`'s `viteIsomorphic`.

## What webpack does (reference)

Files: [`dev-utils/mixins/isomorphic.js`](../../dev-utils/mixins/isomorphic.js),
[`dev-utils/plugins/PrerenderPlugin/`](../../dev-utils/plugins/PrerenderPlugin/)
(`index.js`, `vdom-server-render.js`, `FileXHR.js`, `templates.js`).

1. **Build shape** — the app is built as a **UMD library** (`output.library='App'`,
   `libraryTarget='umd'`, `globalObject='this'`) whose `default` export is the app
   ReactElement. `src/index.js` exports `appElement` as default and guards
   `createRoot`/`hydrateRoot` behind `typeof window` + `ENACT_PACK_ISOMORPHIC`. React is
   exposed on `global` (`expose-loader`) to avoid duplicate copies.
2. **Server render** (`vdom-server-render.render`, per locale): `global.XMLHttpRequest =
   FileXHR` (a synchronous fake XHR that reads iLib locale data from disk so `@enact/i18n`
   can load it during SSR); `global.process.env.LANG = locale`; `require()` the built UMD
   chunk in Node → `chunk.default` = the element; `reactDOMServer.renderToString(...)`;
   optional per-locale font CSS via `app.fontGenerator`, prepended to the markup.
3. **HTML assembly** (`PrerenderPlugin` html hooks + `templates.js`): identical renders
   across locales are **deduped/aliased**; JS `<script>`s are removed from `<body>` and
   replaced by an inline **startup script** (`templates.startup`) in `<head>` that
   async-loads the JS and, at runtime, picks the correct prerendered HTML for the device
   screenType/locale; emits `index.html` + `index.<locale>.html` variants.
4. **webOS meta coupling**  generates per-locale `resources/<locale>/appinfo.json` with
   `main: index.<locale>.html`, and sets root `usePrerendering: true`.

## How the Vite path works

Vite has first-class SSR, which replaces the UMD-in-Node approach. The app is rendered
from a real **`vite build --ssr`** of a server entry (so the full plugin/babel pipeline
runs, including the JSX-in-`.js` transform) rather than dev-time `ssrLoadModule` (which
skips that transform and fails at `App.js`).

Pipeline for `pack --isomorphic --vite`:

1. **Client build** → `main.js`, `main.css`, assets, with the `ViteHtmlPlugin` output as
   the hydration shell (isomorphic → the app entry uses `hydrateRoot`).
2. **SSR build** — a second Rollup build (`build.ssr = <server entry>`, `ssr.noExternal`
   for `@enact/*`) producing a Node-loadable `app.server.cjs` whose default export is the
   app element. The server entry re-exports the app's default; the `window` guard keeps the
   client render side-effect from firing under SSR.
3. **Prerender** — for each locale from `parseLocales` (in `ViteILibPlugin`): install the
   locale XHR global, set `process.env.LANG = locale`, `require()` the SSR bundle fresh
   (uncached), `renderToString`, then dedupe identical renders.
4. **HTML assembly** — inject the prerendered markup into `<div id="root">…</div>` of the
   client `index.html`, add the startup `<script>` in `<head>`, remove the body module
   script (the startup script adds it), and write `index.<variant>.html` + `locale-map.json`.
5. **webOS meta** — root `usePrerendering:true` + per-locale `resources/<lang>/<region>/appinfo.json`
   with `main` → the locale's variant.

Reused as-is from `@enact/dev-utils` (all bundler-agnostic): `FileXHR.js`, `templates.js`,
`parseLocales`/`detectLocales` (now in `ViteILibPlugin`), and the alias/dedupe logic. Only
the webpack-runtime string rewrites in `vdom-server-render.stage`
(`__webpack_require__.e`, `webpackAsyncContext`) are webpack-specific and are not needed —
Vite's SSR bundle has no such runtime.

## Implementation details

These are the specifics that make the Vite SSR render match webpack's output.

1. **Real `vite build --ssr`, not `ssrLoadModule`.** The JSX-in-`.js` transform runs and
   `@enact/*` (in `ssr.noExternal`) is bundled + babel-transformed.
2. **CJS output** (`output.format='cjs'` + `inlineDynamicImports`). The bundle carries
   leftover `require()` (ilib's platform loaders); an ESM (`.mjs`) bundle throws
   `require is not defined`. The prerender loads it with `require()`.
3. **ilib: bundle it + keep the *Node* loader.** The client config ignores **all** ilib
   platform loaders (`ILIB_LOADER_RE`) because the browser can't use them; for SSR-in-Node,
   `applySsrBuild` overrides `commonjsOptions.ignore` to keep `NodeLoader`/`ilib-node.js`
   (ignoring only Qt/Rhino/Ringo) so ilib reads locale data from disk, and adds
   `/^ilib($|\/)/` to `ssr.noExternal` (externalized, its internal dynamic imports resolve
   to a wrong path).
4. **No `window`/DOM shim needed.** Enact renders server-side without a DOM (matching
   webpack's `vdom-server-render`, which sets only `XMLHttpRequest`+`LANG`, never `window`).
5. **Locale XHR — a `FileXHR` subclass that strips the leading `/`.** `@enact/i18n` builds
   **absolute** locale URLs (`/node_modules/ilib/locale/ilibmanifest.json`,
   `/resources/ilibmanifest.json`) because Vite's base is `/`. `FileXHR` reads relative to
   cwd (the app dir), so `makeLocaleXHR()` **subclasses** `FileXHR` and overrides `open()`
   to strip the leading `/`, and both manifests resolve (200) from
   `node_modules/ilib/locale/…` and `resources/…`. It must **subclass**, not wrap: the
   `xhr` package `@enact/i18n`'s loader uses assigns its completion handler as a property
   (`xhr.onload = fn`) rather than via `addEventListener`, and `FileXHR.send()` invokes
   `this.onload`. A wrapper holding a private `FileXHR` would strand that handler on the
   outer object, so no locale data would load and every locale would prerender unlocalized.
6. **`enact-locale-*` is not emitted server-side — by design.** The current `@enact/i18n`
   `I18n.getServerSnapshot()` returns `className: null`; the locale class is applied on the
   **client** after hydration. Webpack's `--isomorphic` produces the same thing (its
   prerendered `index.multi.html` has no `enact-locale-*` classes either). The success
   criterion is therefore "prerendered markup matches webpack's prerender," which it does.
7. **Identical-across-locales → dedupe.** For a no-translation app (qa-a11y), every locale
   renders identically, so — like webpack — the variants alias to one file
   (`locale-map.json`: both `en-US`+`ko-KR` → `index.multi.html`). Apps with `$L`
   translations render differently per locale and get separate variant files.

## Output and hydration

On qa-a11y (`-p -i -l en-US,ko-KR`) the Vite path emits output matching webpack's shape
byte-for-byte modulo the CSS-module hash suffix:

- `index.html` (2.6 KB) — empty `#root` + inline `templates.startup` script, body module
  script removed.
- `index.multi.html` (71 KB) — prerendered markup in `#root` + `templates.update` script.
- `locale-map.json` — identical to webpack's
  (`{fallback:'index.html', locales:{en-US→index.multi.html, ko-KR→index.multi.html}}`);
  both locales deduped to one variant, reusing `templates.js`.
- Root `appinfo.json usePrerendering:true`, and `resources/en/US`+`resources/ko/KR/appinfo.json`
  (`main:index.multi.html`).

**Hydration:** loading `/index.multi.html` in a browser shows the prerendered markup, the
startup script loads `main.js`, and the **production** (`-p`) output React-hydrates with
**zero console warnings/errors**; the client then applies `enact-locale-en` to the root
(matching the i18n design — null on the server, applied on the client).

A **dev** build surfaces two dev-only React warnings (`getServerSnapshot should be cached`
+ a root-class hydration mismatch) that are **by-design in `@enact/i18n`** (locale class
deferred to the client), identical to webpack's isomorphic output; `-p` strips both.

Assembly specifics wired in:

- **ESM startup script.** `assemble` rewrites `templates.startup`'s dynamically-appended
  script to `type="module"` (Vite emits ES modules; a single `main.js` module self-loads
  its chunks) — robust for code-split apps, unlike the classic `<script>` that only works
  for a self-contained bundle. (The snapshot path keeps it classic, since its `main.js` is
  UMD.)
- **Real screenTypes.** `pack.js` passes `app.screenTypes` (the resolved theme RI
  screen-type array, e.g. limestone's entries) to `assemble`, so the startup script's
  resolution scaling matches webpack (browser-confirmed `enact-res-hd` applied).
- **Per-locale font CSS.** `prerender` reads `app.fontGenerator`, calls `generator(locale)`
  + `fontOverrideGenerator(locale)` per locale, and prepends the CSS as a head-append block
  (so it participates in dedupe); `assemble` extracts it into each variant's `<head>`.
  Browser-verified: limestone's `localized-fonts` `<style>` (with `@font-face`) lands in
  `index.multi.html`'s `<head>`.

## `--isomorphic --externals`

The combination is production-correct and produces the same result as plain
`--isomorphic`. `viteIsomorphic` externalizes the framework + injects the import map on the
**client** build before assembly; the **SSR** build always bundles `@enact` to render. The
app prerenders, is styled (the SSR prerender's CSS-module hashes match the framework's
`enact.css` — deterministic `cssModuleIdent`, e.g. `ThemeDecorator_root__voIZO` ==
`enact.css`), loads `@enact` from the framework via the import map, and hydrates with the
locale applied.

Apples-to-apples (a **dev** framework + dev `--isomorphic --externals` vs. a dev plain
`--isomorphic`, both on qa-a11y `-l en-US,ko-KR`) the two are **byte-identical**: same
hydrated root className, and the **same two dev-only warnings** on the **same**
`<ThemeDecorator>` tree:

1. `The result of getServerSnapshot should be cached to avoid an infinite loop`
2. `A tree hydrated but some attributes … didn't match the client properties` (the root
   className).

Both are inherent to `@enact`'s isomorphic i18n design, not to `--externals` and not to
Vite: `@enact/i18n`'s `I18n.getServerSnapshot()` deliberately returns `className: null`
server-side and the locale class (`enact-locale-*`) is applied on the client after
hydration, so the first client render legitimately differs from the server markup.
**Webpack's isomorphic path has the identical by-design mismatch** (same i18n source, same
`getServerSnapshot`). React's production build strips both dev-only warnings, so shipped
output (`-p`) hydrates silently in every case.

Why webpack's SSR *looks* like it can't diverge: its prerender rewrites
`require('enact_framework')` → the framework's `enact.js` (`vdom-server-render.stage`), so
one `@enact` serves both SSR and client. The Vite path instead uses two `@enact` builds
(SSR-bundled + framework import map) — but because `cssModuleIdent` is deterministic on
`resourcePath` + `rootContext`, both builds emit **identical** CSS-module class names and
identical root markup, so the two-build approach produces the same hydration result as
webpack's single-`@enact` approach.
