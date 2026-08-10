# Measured: webpack vs esbuild vs Vite, command by command

Real measurements, not estimates. Scope is **`serve`**, **`pack`**, and
**`pack -p`** — measured for all three bundlers on the same app in the same
session. These numbers are from the CLI **after** the optimization pass
described below was applied to *both* the Vite and esbuild paths.

**Feature scope note (post-dates this benchmark run):** at the time these
numbers were captured, esbuild only had `serve`/`pack`/`pack -p`, so that's
all this document measures. The esbuild path has since grown
`--isomorphic` (+ every `--locales` mode except `tv`, which hits a known
ilib locale-data gap on `pa-PK` — `signage`'s 20 locales are fine, `tv`'s 195
are not), `--snapshot` (structurally — the actual V8 blob still needs the
firmware-matched `V8_MKSNAPSHOT` toolchain, same caveat as webpack/Vite), and
`--framework`/`--externals`/`--externals-public`/`--externals-polyfill`,
functionally on par with the Vite path (see `vite-benchmarks.md` and
`vite-isomorphic-scope.md` for the equivalent Vite feature descriptions —
esbuild's behavior matches them). None of that is benchmarked here yet — the
tables below remain scoped to what was actually measured; treat any timing
claim for the newer commands as unverified until a real run adds it.

**App:** `limestone/samples/qa-a11y`
**Machine:** PC Intel vPro / 31.5 GB RAM, Windows, Node 24
**Heap:** all bundlers run the same CLI with `NODE_OPTIONS=--max-old-space-size=8192`.

**Methodology** — as in `vite-benchmarks.md`: cold = `node_modules/.cache`
(webpack filesystem + babel-loader caches, esbuild transform cache, Vite babel
cache) and `node_modules/.vite` deleted first; warm = immediate second run into
an empty output dir; peak memory samples the build process **plus** any
`esbuild.exe` child (shown as `+go`); gzip level 9 with `main.js` broken out;
bundlers interleaved per row; machine verified idle at start. Single run per
cell — treat build-time differences under ~20% as noise.

## Build & startup time

| Command | webpack | esbuild | Vite |
| --- | --- | --- | --- |
| `pack` (dev), no cache | **45.3s** | 58.5s | 44.9s |
| `pack` (dev), cached | 40.6s | **10.9s** | 34.5s |
| `pack -p`, no cache | 56.2s | **31.9s** | 47.5s |
| `pack -p`, cached | 50.9s | **11.1s** | 37.9s |
| `serve` ready, no cache | 42.1s | 57.4s | **4.0s** |
| `serve` ready, cached | 36.8s | 5.8s | **4.1s** |

## Peak memory (RSS, Node + esbuild child)

| Command | webpack | esbuild | Vite |
| --- | --- | --- | --- |
| `pack` (dev) | 1127 MB | **966 MB** | 2264 MB |
| `pack -p` | 1210 MB | **827 MB** | 2115 MB |
| `serve` (cached) | 1170 MB | 409 MB | **123 MB** |

## Output size

Byte-identical across every run; the optimizations change build time only.

| Command | bundler | files | total | main.js | **main.js gzip** |
| --- | --- | --- | --- | --- | --- |
| `pack` (dev) | webpack | 6779 | 70.2 MB | 5679 KB | 925 KB |
| | esbuild | 6779 | 74.8 MB | 4431 KB | 699 KB |
| | **vite** | 6778 | 68.3 MB | **3417 KB** | **628 KB** |
| `pack -p` | webpack | 6778 | 59.6 MB | 1108 KB | 314 KB |
| | esbuild | 6777 | 59.8 MB | 1230 KB | 357 KB |
| | **vite** | 6777 | 60.1 MB | **1009 KB** | **286 KB** |

**Minifier knobs** (production, measured):

- esbuild path: `ENACT_ESBUILD_MINIFY=terser` → main.js **1227 KB / 328 KB
  gzip** (vs 1230 / 357 default) — recovers ~29 KB gzip for a few seconds of
  Terser time. CSS is unaffected either way (esbuild's CSS minifier gains
  ~nothing on the already-dense PostCSS output: 949 KB / 67 KB gz both ways).
- Vite path (inverse): `ENACT_VITE_MINIFY=esbuild` → faster minify, +17 KB gzip.

## What the numbers say

- **esbuild owns the builds**: cached `pack -p` in **11.1s vs webpack's 50.9s
  (4.6×)** and Vite's 37.9s; cold in 31.9s vs 56.2s. It is also the lightest
  builder (~0.8–1.0 GB vs webpack's ~1.2 GB and Vite's ~2.1–2.3 GB).
- **Vite owns the dev server**: ready in **4s cold** — its architectural
  advantage (native ESM served per module, no app bundle) — vs esbuild's 57.4s
  cold / 5.8s warm and webpack's 36.8s warm. Warm, Vite and esbuild are
  equivalent; both are ~7–9× webpack.
- **Vite still produces the smallest bundles** (prod 286 KB gzip vs webpack
  314 KB vs esbuild 357 KB — or 328 KB with the Terser knob); Rollup
  tree-shakes hardest (esbuild's remaining +43 KB vs webpack is bundler-inherent
  tree-shaking, not a config gap — dedupe and polyfill sets are identical).
- **webpack no longer wins a single row** of this table.
- esbuild's weak spot is **cold serve** (57.4s): it must bundle the whole app
  before serving anything, on a cold transform cache. Warm restarts are 5.8s.

## Optimizations applied (both non-webpack paths)

Found by per-hook profiling (see `vite-benchmarks.md` for the full analysis):

1. **iLib data copy** — the ~70 MB / 6,750-file locale tree was copied with a
   synchronous single-threaded walk. Both `ViteILibPlugin` and
   `EsbuildILibPlugin` now use an async 32-way pooled copy that skips files
   whose destination is already current.
2. **ESLint overlapped with the build** — Vite: started at `buildStart`,
   awaited at `closeBundle`. esbuild: the lint child now spawns at `onStart`
   instead of `onEnd` (where its process handle also kept `pack` alive after
   the build, adding the whole lint runtime to wall clock).
3. **Transform caching** — content-keyed memory+disk caches for babel (both
   paths) and LESS/PostCSS (esbuild path); this is most of the cached-column
   advantage, and why esbuild's cached `pack -p` is 11s.
4. **Minifier choice exposed** — the env knobs above.
5. *(Vite only)* concurrent client+SSR isomorphic builds — no esbuild
   equivalent since `--isomorphic` is not ported.

Earlier size fixes also carried by both paths: dependency dedupe (iLib was
bundled twice; ramda/prop-types/etc. once per `@enact/*` package) and, on the
Vite path, the core-js `useBuiltIns: 'entry'` expansion (483 → 77 modules).

## Caveats

1. Build timings on this machine drift 2–4× with background load; this run was
   started on a verified-idle machine and its webpack rows match the previous
   stable session (±5%). Compare across sessions only via output sizes, which
   are deterministic.
2. Peak memory excludes webpack's parallel Terser workers (webpack somewhat
   understated).
3. esbuild `serve` copies iLib data into `node_modules/.cache/enact-esbuild`
   and serves from disk; Vite serves locale data from source via middleware —
   that difference is what the serve memory numbers reflect.

## Reproducing

```bash
cd limestone/samples/qa-a11y
rm -rf node_modules/.cache node_modules/.vite dist   # clears all three caches
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p              # webpack
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p --esbuild    # esbuild
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p --vite       # vite
NODE_OPTIONS=--max-old-space-size=8192 enact serve                # webpack
NODE_OPTIONS=--max-old-space-size=8192 enact serve --esbuild      # esbuild
NODE_OPTIONS=--max-old-space-size=8192 enact serve --vite         # vite
# smaller esbuild bundle (+Terser time):
ENACT_ESBUILD_MINIFY=terser NODE_OPTIONS=--max-old-space-size=8192 enact pack -p --esbuild
```

Newer esbuild commands (functional, not benchmarked above):

```bash
enact pack --esbuild --isomorphic --locales=en-US,ko-KR   # prerender, one variant per locale
enact pack --esbuild --framework --externals-polyfill      # shared framework bundle (in the theme repo)
enact pack --esbuild --externals=../limestone/dist --externals-polyfill -o app-dist  # app build against it
```
