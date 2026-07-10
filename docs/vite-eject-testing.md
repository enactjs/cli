# Testing `enact eject` with Vite

This guide walks through validating the Vite support that was added to the `eject`
command. It is written as a **manual** procedure because `eject` is destructive: it
rewrites the app's `package.json`, requires a clean git working tree, copies files
into the app, and runs `npm install`. Do not run it against an app you care about —
always use a throwaway copy in a fresh git repo.

## What changed

`eject` copies the CLI's `config/` (now including `vite.config.js`, `postcss-plugins.js`)
and the `commands/` (as `scripts/`, including the `--vite`-capable `pack.js`/`serve.js`).
Two eject modes exist:

- **Default eject** (`enact eject`) — keeps the Enact scripts and rewrites the app's
  npm tasks from `enact <cmd>` to `node ./scripts/<cmd>.js`, preserving any flags. Adding
  `--vite` here **appends `--vite`** to the bundler-driven scripts (`serve`, `pack`,
  `pack-p`, `watch`) so they run the Vite path; `clean`/`lint`/`test` are left untouched.
  (Flags already present on a script — e.g. `enact serve --vite` — are preserved regardless.)
- **Bare eject** (`enact eject --bare`) — abandons the Enact scripts and rewrites the
  npm tasks to invoke the underlying tools directly. This was **webpack-only**. Adding
  `--vite` makes it emit a **Vite** barebones setup instead.

New pieces in [commands/eject.js](../commands/eject.js):

| Piece | Purpose |
|---|---|
| `--vite` flag | Non-bare: appends `--vite` to the `serve`/`pack` scripts. Bare: selects the Vite flavor of the barebones setup. |
| `VITE_CAPABLE_SCRIPTS` | The scripts that understand `--vite` (`serve`, `pack`) — only these get the flag in a non-bare Vite eject. |
| `bareTasksVite` | Vite npm scripts: `serve → vite`, `pack → vite build --mode development`, `pack-p → vite build`, `watch → vite build --watch --mode development`. |
| `bareDepsVite` | Bare Vite deps: just `rimraf` (Vite copies `public/` automatically, so no `cpy-cli`). |
| `VITE_ROOT_CONFIG` → `vite.config.mjs` | A root config the Vite CLI auto-loads. The Enact config `config/vite.config.js` is a factory `(mode) => InlineConfig`; this adapter maps Vite's `{command, mode}` call onto it. |

## Prerequisites

- A local build of this CLI (so `enact` resolves to your working tree). Either:
  - Run via the repo's bin: `node <repo>/cli/bin/enact.js <cmd>`, or
  - `npm link` the CLI once: `cd <repo>/cli && npm link`, then `enact` is on PATH.
- `git` available (eject aborts if the working tree is dirty).
- Node + npm able to reach your registry (eject runs `npm install`).

Throughout, `enact` means "the CLI under test". Substitute `node <repo>/cli/bin/enact.js`
if you did not link.

### Important: the ejected app needs a Vite-capable `@enact/dev-utils`

An ejected app is standalone — its `config/vite.config.js` does
`require('@enact/dev-utils')` and resolves it from the **app's** `node_modules`, not the
CLI's. The Vite plugins (`ViteHtmlPlugin`, `ViteILibPlugin`, `ViteWebOSMetaPlugin`) live in
the **working-tree** `dev-utils` and are **not yet in any published `@enact/dev-utils`**.
So a freshly-ejected app that installed `@enact/dev-utils` from npm will fail with
`ViteHtmlPlugin is not a function`.

Until a dev-utils with the Vite plugins is published, point the ejected app at the
working-tree copy. On Windows (junction; reversible — a later `npm install` restores the
published copy):

```powershell
$link   = "<app>\node_modules\@enact\dev-utils"
$target = "<repo>\dev-utils"
if (Test-Path $link) { (Get-Item $link).Delete() }
New-Item -ItemType Junction -Path $link -Target $target
```

On macOS/Linux: `rm -rf <app>/node_modules/@enact/dev-utils && ln -s <repo>/dev-utils <app>/node_modules/@enact/dev-utils`
(or `npm link @enact/dev-utils` after `npm link` in the working-tree `dev-utils`).

## Set up a throwaway test app

Use a **limestone** sample (per project convention, checkups run against limestone, not
sandstone). Copy it out of the monorepo so the eject can't touch tracked files, and give
it its own git repo:

```bash
# from the repo root (…/LGE)
cp -r limestone/samples/qa-dropdown /tmp/eject-test
cd /tmp/eject-test

# install its deps so it's runnable before ejecting
npm install

# eject requires a clean git tree
git init -q && git add -A && git commit -qm "baseline before eject"
```

Sanity-check the app runs on Vite **before** ejecting (this is what eject must preserve):

```bash
enact serve --vite      # open the printed URL, confirm the app renders, then Ctrl-C
enact pack --vite -p     # confirm ./dist is produced
git checkout -- . && git clean -fdq   # discard the build artifacts
```

---

## Test A — Non-bare Vite eject

Goal: `enact eject --vite` (no `--bare`) points the copied scripts at the Vite path, so
the app builds/serves with Vite. The app's original scripts can be plain webpack
(`enact serve`) — the flag is added for you.

1. Eject with `--vite` (answer **yes** at the confirmation prompt):
   ```bash
   enact eject --vite
   ```

2. **Verify** — expect:
   - A `config/` dir containing **both** `webpack.config.js` **and** `vite.config.js`,
     plus `postcss-plugins.js`.
   - A `scripts/` dir containing `pack.js`, `serve.js`, `vite-utils.js`.
   - `package.json` scripts with `--vite` appended to the bundler scripts:
     `"serve": "node ./scripts/serve.js --vite"`,
     `"pack": "node ./scripts/pack.js --vite"`,
     `"pack-p": "node ./scripts/pack.js --vite -p"`,
     `"watch": "node ./scripts/pack.js --vite --watch"`.
     `clean`/`lint`/`test` have **no** `--vite`.

3. **Run it:**
   ```bash
   npm run serve      # → open the URL, confirm the app renders (Vite dev server)
   npm run pack-p     # → confirm ./dist is produced
   ```
   Open the browser console: **no errors**, the sample renders as it did pre-eject.

4. Reset for the next test:
   ```bash
   cd /tmp && rm -rf eject-test && cp -r <repo>/limestone/samples/qa-dropdown /tmp/eject-test
   cd /tmp/eject-test && npm install && git init -q && git add -A && git commit -qm baseline
   ```

---

## Test B — Bare Vite eject (the new path)

Goal: `--bare --vite` produces a self-contained Vite setup that runs the Vite CLI directly.

1. Eject bare + vite (answer **yes** at the prompt):
   ```bash
   enact eject --bare --vite
   ```

2. **Verify files:**
   - A **`vite.config.mjs`** at the app root containing the `createRequire` adapter that
     re-exports `config/vite.config.js` as `({mode}) => enactViteConfig(mode || 'production')`.
   - `config/vite.config.js` and `config/postcss-plugins.js` present.
   - `package.json`:
     - `scripts`: `serve → "vite"`, `pack → "vite build --mode development"`,
       `pack-p → "vite build"`, `watch → "vite build --watch --mode development"`,
       `clean → "rimraf build dist"`, plus `lint`/`test` unchanged.
     - `devDependencies` include `vite`, `@vitejs/plugin-react`, `@enact/dev-utils`,
       `babel-preset-enact`, the `postcss-*` packages, and `rimraf`.
     - **No** `scripts/` dir and no `enact`/`node ./scripts/...` references (this is bare).

3. **Run it** (deps were installed by eject; if you edited `package.json` after, `npm install`):
   ```bash
   npm run serve      # → Vite dev server; open URL, confirm render + clean console
   npm run pack-p     # → vite build (production); confirm ./dist with hashed assets
   npm run pack       # → vite build --mode development; confirm ./dist (unminified)
   npm run watch      # → rebuilds on change; edit a source file, confirm rebuild, Ctrl-C
   npm run clean      # → removes build/ and dist/
   ```

4. **What "pass" looks like:**
   - `npm run serve` serves the app and the browser renders it with no console errors.
   - `npm run pack-p` exits 0 and writes `./dist/index.html` plus hashed JS/CSS.
   - `./dist/index.html` references the built assets (open it via a static server, e.g.
     `npx serve dist`, and confirm it renders — `file://` won't work due to module paths).

5. **Known-good caveats to expect (not failures):**
   - The app still receives webpack-related devDeps (webpack is a CLI dependency, so the
     generic dep-merge copies it). They're unused by the Vite tasks — harmless bloat.
   - `vite.config.mjs` uses the factory's **defaults** for locale filtering, content hash,
     isomorphic, etc. Bare mode intentionally drops the CLI's flag plumbing; to customize,
     edit `vite.config.mjs` to pass extra factory args, e.g.
     `enactViteConfig(mode, false, true /* contentHash */, false, false, false, undefined, 'tv')`.

---

## Test C — Regression: bare webpack eject still works

Confirm the default `--bare` (no `--vite`) is unchanged.

```bash
# fresh copy as above, then:
enact eject --bare
```

**Verify:** `package.json` scripts use webpack directly
(`pack-p → "webpack --env production --config config/webpack.config.js && cpy public dist"`),
`cpy-cli` + `rimraf` are in devDependencies, and **no** `vite.config.mjs` is written.
`npm run pack-p` produces `./dist`.

---

## Cleanup / rollback

Everything happens in the throwaway copy, so just delete it:

```bash
cd /tmp && rm -rf eject-test
```

If you ever eject in a real repo by mistake, `git reset --hard && git clean -fd` restores
it (eject refuses to run on a dirty tree precisely so this is always possible).

## Quick checklist

- [ ] Test A: default eject → `node ./scripts/*.js --vite`, app serves + packs.
- [ ] Test B: `--bare --vite` → `vite.config.mjs` written; `serve`/`pack`/`pack-p`/`watch`/`clean` all work; `./dist` renders.
- [ ] Test C: `--bare` → webpack scripts unchanged, no `vite.config.mjs`.
- [ ] Browser console clean in every serve/build.
