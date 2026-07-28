# Measured: webpack vs esbuild, command by command

Real measurements, not estimates. Scope is deliberately limited to the three
commands the esbuild path implements today: **`serve`**, **`pack`**, and
**`pack -p`**. (`--isomorphic`, `--snapshot` and `--framework`/`--externals` are
not ported to esbuild yet, so they are not measured.)

**App:** `limestone/samples/qa-a11y`
**Machine:** PC Intel vPro / 31.5 GB RAM, Windows, Node 24
**Heap:** both bundlers run the same `enact pack`/`enact serve` CLI with
`NODE_OPTIONS=--max-old-space-size=8192`.

**Methodology** — metric set follows the same shape as the Vite comparison
(startup, build no-cache/with-cache, memory, output size, gzipped size):

- **No cache** — `<app>/node_modules/.cache` is deleted before the run. That one
  directory holds *both* bundlers' caches: webpack's `cache:{type:'filesystem'}`
  and its `babel-loader` cache, and esbuild's transform cache
  (`.cache/enact-esbuild-transform`). Deleting it resets both, so neither starts
  warm.
- **With cache** — an immediate second run. `pack` empties the output dir first
  (both bundlers), so the cache is the only variable.
- **Peak memory** — the process's Windows `PeakWorkingSet64`, sampled every
  150 ms. **esbuild's numbers include its separate `esbuild.exe` Go process**,
  which is where its bundling actually happens; counting only the Node process
  would understate esbuild by ~150–240 MB. Neither figure covers webpack's
  parallel Terser workers.
- **Gzipped** — gzip(level 9) of all emitted JS+CSS+HTML: a network-transfer proxy.
- Single run per cell except the dev-server row (3 runs, median reported) —
  see *Variance* below.

## Build & startup time

| Command | webpack (no cache) | esbuild (no cache) | webpack (cached) | esbuild (cached) |
| --- | --- | --- | --- | --- |
| `pack` (dev) | **45.6s** | 51.1s | 40.2s | **30.7s** |
| `pack -p` | 53.7s | **51.9s** | 33.9s | **27.1s** |
| `serve` (dev server ready) | **30.4s** | 32.6s | 22.0s | **2.5s** |

Cold builds are near-parity (esbuild is 12% slower on `pack`, 3% faster on
`pack -p`). Cached builds — the developer's normal case — favour esbuild by
24–43%. The dev server is the outlier: **8.8× faster**.

## Peak memory (RSS)

esbuild is shown as `Node + Go` because the work is split across two processes.

| Command | webpack | esbuild (Node + Go = total) |
| --- | --- | --- |
| `pack` (dev) | 1126 MB | 730 + 213 = **943 MB** |
| `pack -p` | 1450 MB | 732 + 148 = **880 MB** |
| `serve` (cold) | 1201 MB | 674 + 222 = **896 MB** |
| `serve` (cached) | 1265 MB | 167 + 228 = **395 MB** |

## Output size

The gzipped `main.js` is the figure that tracks bundling quality. Total on-disk
output is dominated by iLib locale JSON (~60 MB) and is not a useful comparison.

`gzip` here is the total of all emitted JS+CSS+HTML (as in the Vite document).
`main.js gzip` is broken out separately because it is the figure that actually
tracks bundling quality — the rest is dominated by `main.css`, which both
bundlers emit near-identically.

| Command | webpack: files/total/main.js/gzip | esbuild: files/total/main.js/gzip |
| --- | --- | --- |
| `pack` (dev) | 6779 / 70.2 MB / 5679 KB / 1011 KB | 6779 / 74.8 MB / **4431 KB** / **780 KB** |
| `pack -p` | 6778 / 59.6 MB / **1108 KB** / **386 KB** | 6777 / 59.8 MB / 1230 KB / 424 KB |

`main.js` gzipped, like for like: **webpack 314 KB vs esbuild 357 KB (+14%)**.

> The esbuild `pack -p` row above is *after* the deduplication fixes described in
> [Why the production bundle is bigger](#why-the-production-bundle-is-bigger).
> Before them it was 1346 KB / 461 KB total gzip / 370 KB main.js gzip.

## What the numbers say

- **The dev server is esbuild's decisive win: 2.5s vs 22.0s warm (8.8×), using
  395 MB vs 1265 MB (3.2× less).** This is the day-to-day feedback loop and the
  main reason to migrate. It is also the most *stable* measurement in the table
  (esbuild 2.4/2.5/2.6s across three runs, webpack 20.7/22.0/25.3s).
- **Cold builds are near parity; warm builds favour esbuild.** Cold, esbuild is
  12% slower on `pack` (51.1s vs 45.6s) and 3% faster on `pack -p` (51.9s vs
  53.7s). Warm, esbuild wins both: `pack` 30.7s vs 40.2s (24% faster) and
  `pack -p` 27.1s vs 33.9s (20% faster). Cold builds are the CI case; warm
  builds are the developer case.
- **esbuild uses less memory everywhere**, even counting its Go process: 16–39%
  less to build and 3.2× less to serve.
- **esbuild's production bundle is still bigger — the one remaining regression.**
  `main.js` 1230 KB vs 1108 KB (+11%), gzipped 357 KB vs 314 KB (+14%). It
  started at +21%/+18%; roughly half of that turned out to be duplicated
  dependencies and was fixed (see below). Note the *dev* bundle is the other way
  round: esbuild 4431 KB vs webpack 5679 KB (gzip 780 KB vs 1011 KB).
- **Both caches help, esbuild's more.** webpack's filesystem cache is worth
  12% (`pack`) and 37% (`pack -p`); esbuild's transform cache is worth 40%
  (`pack`), 48% (`pack -p`) and **13×** on `serve`.
- **esbuild's dev bundle is now 22% smaller** than webpack's (4431 KB vs
  5679 KB; gzip 780 KB vs 1011 KB), a side effect of the dependency dedupe.

### Recommendation

The dev-server result is the one that changes daily work, and it is decisive and
reproducible: **2.5s vs 22.0s**, at a third of the memory. Warm builds are
20–24% faster and cold builds are at parity, so nothing regresses on the build
side either.

The remaining production-bundle gap is +11% raw / +14% gzipped on `main.js`.
It was investigated (below): about half the original gap was duplicated
dependencies and is now fixed, and a further ~32 KB gzip is recoverable by
running the production output through Terser if that trade (≈4s build time) is
judged worthwhile. Nothing here blocks adopting the esbuild path; the bundle-size
delta is the one item to weigh before making it the default for release builds.

## Why the production bundle is bigger

Both non-webpack bundlers regressed on production bundle size (Vite +14%,
esbuild originally +21%), which suggested a shared, structural cause rather than
a quirk of one tool. Three hypotheses were tested against measurements.

### 1. Duplicated dependencies — confirmed, and mostly fixable (was ~115 KB)

esbuild resolves each importer's *nearest* copy of a package. The Enact stack
ships a copy of several shared libraries inside each `@enact/*` package, and
iLib exists both as a top-level `ilib` and nested under `@enact/i18n/ilib`. The
result: the same module bundled several times. Measured from esbuild's metafile
(bytes of the redundant copies only):

| Package | wasted | why |
| --- | --- | --- |
| `ilib` | 69 KB | two copies — `limestone/node_modules/ilib` **and** `enact/packages/i18n/node_modules/ilib` |
| `ramda` | 39 KB | four copies, one per `@enact/*` package |
| `prop-types` | 3 KB | five copies |
| `warning`, `classnames`, `invariant` | 4 KB | one per `@enact/*` package |

webpack avoids this by flattening resolution: `resolve.modules` lists the app's
`node_modules` first and `symlinks: false` keeps symlinked packages on their
in-app paths. **webpack is not immune, though** — its bundle actually carries
*more* duplicated `ramda` modules than esbuild's (159 vs 138 extra copies). What
webpack does avoid is the expensive one: it ships iLib once.

**Fix applied** (`config/esbuild.config.js`): every one of these is pinned to a
single resolved directory, the same technique already used for
`react`/`react-dom`/`react-is`. Safe here because the whole stack pins identical
versions (ramda 0.32.0, classnames 2.5.1, warning 4.0.3, invariant 2.2.4). Effect
on qa-a11y `main.js`: **1346 KB → 1230 KB** (gzip 370 → 357 KB), verified with
the app still rendering and iLib locale data still loading.

### 2. Minifier quality — ruled out for raw size, real for gzip (~32 KB)

Minifying the *same* unminified esbuild bundle (3313 KB) two ways:

| Minifier | raw | gzip |
| --- | --- | --- |
| esbuild (built-in) | 1273 KB | 370 KB |
| Terser (what webpack and Vite use) | 1276 KB | **338 KB** |

esbuild's minifier is **equal to Terser on raw bytes** (3 KB better, in fact) but
its output **compresses ~32 KB worse** — Terser's naming/ordering is more
gzip-friendly. So the raw-size gap is not a minification-quality problem, but
about 3/4 of the remaining *gzip* gap is. Running the production output through
Terser is an available option: ~4s extra build time to recover ~32 KB gzip,
which would put esbuild within ~4% of webpack. Not enabled by default.

### 3. Remaining gap (~122 KB raw)

After deduplication, esbuild still emits ~122 KB more raw than webpack. This is
not CJS interop overhead — the bundle contains zero `__commonJS`/`__toESM`
wrappers. The likely remainder is tree-shaking differences and per-module
boilerplate; it was not chased further because gzip (the number that matters for
transfer) is within 14%, and 32 KB of that is recoverable via Terser.

### The same approach applied to Vite — and a second, bigger cause

The duplication is bundler-agnostic (it comes from the on-disk package layout),
so the same analysis was run against the Vite path. It had the identical problem
— 22 redundant iLib modules, 12 prop-types, plus ramda/classnames/invariant —
because its `resolve.dedupe` list only covered React and `@enact/*`, and for an
app like qa-a11y (no local `node_modules/@enact`) that list is effectively just
React. Adding the shared libraries to `resolve.dedupe` removed **all** of them.

Profiling Vite also surfaced a second, larger and Vite-specific problem:
**it was bundling the entire core-js stable set — 483 modules against webpack's
77.** `babel-preset-enact` uses `useBuiltIns: 'entry'`, which rewrites
`import 'core-js/stable'` into just the polyfills the app's browserslist needs.
But Vite's generated combined entry is written to
`node_modules/.cache/enact-vite/index.js`, and the react plugin's
`exclude: /node_modules(?!@enact)/` skipped it — so the import was never
rewritten and Rollup pulled in all of core-js. Exempting that one generated file
from the exclude restores the intended behaviour (**483 → 77 modules, exactly
matching webpack**). esbuild never had this problem: its entry goes through
`config/polyfills.js`, which *is* transpiled, so it already bundled 77.

Combined effect on qa-a11y `main.js`:

| Vite | main.js | gzip | modules | duplicate copies | core-js modules |
| --- | --- | --- | --- | --- | --- |
| before | 1264 KB | 373 KB | 1218 | 198 | 483 |
| + dedupe | 1150 KB | 338 KB | — | 0 | 483 |
| + core-js fix | **1009 KB** | **286 KB** | 614 | 0 | 77 |
| *webpack, for reference* | *1108 KB* | *314 KB* | *977* | *167* | *77* |

**Vite now produces a smaller bundle than webpack (−9% raw, −9% gzipped)** with
zero duplicated modules, where webpack still carries 167 redundant copies. It
also emits far fewer modules overall (614 vs 977), reflecting Rollup's more
aggressive tree-shaking — which is also why Vite's output is now smaller than
esbuild's (1009 KB vs 1230 KB) despite both having identical dedupe and
polyfill sets.

Verified on qa-a11y plus qa-dropdown, qa-i18n and tutorial-hello-enact: all
build clean, the app renders with no console errors, iLib locale data loads, and
`enact serve --vite` still starts (~2s).

## Caveats, honestly

1. **Do not compare these times with the Vite document's times.** That run was
   on a faster machine; the same webpack `pack -p` is 40.3s there and 92.8s
   here. *Output sizes are* comparable — this run reproduces the Vite doc's
   webpack figures exactly (6779 files / 5679 KB / 1011 KB dev; 6778 /
   1108 KB / 386 KB prod), which is a good cross-check that the measurement
   method matches.
2. **Background load dominates absolute timings — the table above is from an
   idle machine.** Earlier passes of this same benchmark, run while dev servers
   and test sweeps were alive, produced *2–3× slower* figures for **both**
   bundlers (webpack `pack -p` 92.8s vs 53.7s here; webpack `serve` 77.9s vs
   30.4s). The webpack/esbuild *ratios* stayed consistent across those passes,
   but only compare absolute numbers from a single run. Even idle, the same cell
   varies by ~10–20%, so treat small build-time differences as noise; the
   dev-server row is repeated three times per bundler and is tight (webpack
   20.7/22.0/25.3s, esbuild 2.4/2.5/2.6s).
3. **The caches are not symmetric by design.** webpack's `babel-loader` cache is
   enabled in development only (`cacheDirectory: !isEnvProduction`), while the
   esbuild transform cache is active in both modes. That is an implementation
   difference in this migration, not a handicap imposed on webpack.
4. **A measurement-driven fix is included in these numbers.** Profiling the dev
   start showed 35.7s of a 37.2s build was `EsbuildILibPlugin` re-copying the
   ~70 MB / 6,700-file iLib tree on every start, versus 1.5s of actual
   bundling. The copy is now incremental (skip files already present and
   unchanged), which is what makes the 2.5s dev-server figure possible. `pack`
   still pays the full copy because it empties the output dir first — as does
   webpack — so the `pack` rows are unaffected.
5. **`serve` readiness** means "first build finished, server answering": webpack's
   `Compiled successfully` and esbuild's `[watch] build finished` markers.
6. Single run per cell for the build rows (matching the Vite document's
   approach), so small differences there are not meaningful.

## Reproducing

```bash
cd limestone/samples/qa-a11y
rm -rf node_modules/.cache dist          # clears BOTH bundlers' caches
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p              # webpack
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p --esbuild    # esbuild
NODE_OPTIONS=--max-old-space-size=8192 enact serve                # webpack
NODE_OPTIONS=--max-old-space-size=8192 enact serve --esbuild      # esbuild
```

`ENACT_ESBUILD_NO_CACHE=true` disables the esbuild transform cache if you want
to measure the uncached path without deleting the directory.
