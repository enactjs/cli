# Measured: webpack vs Vite, command by command

Real measurements, not estimates. These numbers are from the CLI **after** the
Vite-path optimizations described in *What changed* below; the earlier figures
they replace are quoted there.

**App:** `limestone/samples/qa-a11y`
**Machine:** PC Intel vPro / 31.5 GB RAM, Windows, Node 24
**Heap:** both bundlers run the same `enact pack`/`enact serve` CLI with
`NODE_OPTIONS=--max-old-space-size=8192` (webpack's `--framework` build OOMs at
the default heap, so the larger heap is given to both for fairness).

**Methodology** — metric set follows
[rstackjs/build-tools-performance](https://github.com/rstackjs/build-tools-performance),
the reference bundler benchmark (startup, build no-cache/with-cache, memory,
output size, gzipped size):

- **No cache** — `<app>/node_modules/.cache` (webpack's `cache:{type:'filesystem'}`
  + babel-loader cache, **and** the Vite path's babel transform + eslint caches)
  and `<app>/node_modules/.vite` (Vite's dep-optimizer cache) are deleted before
  the run, so neither bundler starts warm.
- **With cache** — an immediate second run. Both runs build into an empty output
  dir, so the cache is the only variable.
- **Peak memory** — the build process's Windows `PeakWorkingSet64`, sampled every
  150 ms, **plus** any `esbuild` child process (Vite uses esbuild for dependency
  pre-bundling). Does not cover webpack's parallel minifier workers.
- **Gzipped** — gzip(level 9). `main.js gzip` is broken out separately from the
  all-JS+CSS+HTML total, because the total is dominated by `main.css` and hides
  the bundling difference.
- **Bundlers are interleaved per command** (webpack then Vite, same row, back to
  back) so machine drift affects both roughly equally. This run was verified
  started on an idle machine and its webpack rows are internally consistent.
- Single run per cell; treat build-time differences under ~20% as noise (see
  *Caveats*).

## Build & startup time

| Command | webpack (no cache) | Vite (no cache) | webpack (cached) | Vite (cached) |
| --- | --- | --- | --- | --- |
| `pack` (dev) | 46.6s | 48.1s | 42.3s | **35.8s** |
| `pack -p` | 60.6s | **49.8s** | 54.6s | **20.8s** |
| `pack -p --no-minify` <sup>1</sup> | 31.1s | 28.0s | — | — |
| `pack -p --content-hash` | 32.8s | **28.8s** | — | — |
| `pack -p -i` (isomorphic) | 44.8s | **41.8s** | — | — |
| `pack -p -i -l en-US,ko-KR` <sup>2</sup> | 45.7s | 56.3s | — | — |
| `pack -p --snapshot` | 49.1s | 48.4s | — | — |
| **`serve` (dev server ready)** | **26.4s** | **2.1s** | **21.4s** | **2.1s** |

## Peak memory (RSS)

| Command | webpack | Vite |
| --- | --- | --- |
| `pack` (dev) | 1134 MB | 2614 MB |
| `pack -p` | 1206 MB | 1709 MB |
| `pack -p -i` | 1467 MB | 2513 MB |
| `pack -p --snapshot` | 1520 MB | 3453 MB |
| **`serve`** | **1283 MB** | **123 MB** |

## Output size

The gzipped `main.js` is the figure that tracks bundling quality. Total on-disk
output is dominated by iLib locale JSON (~60 MB) and is not a useful comparison.
Sizes are byte-identical across every run of this benchmark (before and after
the build-time optimizations — none of them change output).

| Command | webpack: files / total / main.js / main.js gzip | Vite: files / total / main.js / main.js gzip |
| --- | --- | --- |
| `pack` (dev) | 6779 / 70.2 MB / 5679 KB / 925 KB | 6778 / 68.3 MB / **3417 KB** / **628 KB** |
| `pack -p` | 6778 / 59.6 MB / 1108 KB / 314 KB | 6777 / 60.1 MB / **1009 KB** / **286 KB** |
| `pack -p --no-minify` <sup>1</sup> | 6778 / 59.7 MB / 1108 KB / 314 KB | 6777 / 61.6 MB / 2543 KB / 471 KB |
| `pack -p --content-hash` | 6778 / 59.6 MB / 1108 KB / 315 KB | 6777 / 60.1 MB / **1009 KB** / **286 KB** |
| `pack -p -i` | 6778 / 59.7 MB / 1109 KB / 315 KB | 6777 / 60.2 MB / **1009 KB** / **286 KB** |
| `pack -p -i -l en-US,ko-KR` <sup>2</sup> | 6782 / 59.7 MB / 1109 KB / 315 KB | **2013 / 18.7 MB** / **1009 KB** / **286 KB** |
| `pack -p --snapshot` | 6778 / 59.7 MB / 1115 KB / 317 KB | 6777 / 60.2 MB / **1014 KB** / **288 KB** |

## What the numbers say

- **The dev server is Vite's decisive win: ready in 2.1s vs 26.4s cold (12×),
  identical warm, at 123 MB vs 1283 MB (10× less).** This is the day-to-day
  feedback loop and the main reason to migrate.
- **Vite now wins the production builds too**: `pack -p` 49.8s vs 60.6s cold
  (18% faster) and **20.8s vs 54.6s cached (2.6×)** — the cached case is a
  developer's normal rebuild. `--content-hash`, `-i` and `--snapshot` are at
  parity or better.
- **Isomorphic — previously Vite's structural worst case (1.39× slower) — is now
  faster than webpack** (41.8s vs 44.8s): the client and SSR builds run
  concurrently, and the SSR build no longer wastefully copies the iLib tree.
- **The one build Vite still loses is `-i -l` (multi-locale prerender)**, 56.3s
  vs 45.7s: the prerenderer reloads the SSR bundle fresh per locale so iLib
  re-initializes. In exchange the deployable is 69% smaller (see Note 2).
- **Vite trades memory for build speed**: ~1.4–2.3× webpack while building
  (peaking at 3.5 GB for `--snapshot`, where two builds run concurrently), but a
  tenth of webpack's memory to serve.
- **Vite's bundles are smaller across the board**: production `main.js` 9%
  smaller (286 KB vs 314 KB gzipped), dev bundle 32% smaller.

## What changed (optimizations behind these numbers)

An earlier run of this benchmark had Vite *losing* most build rows (e.g.
`pack -p` 114.2s vs webpack's 135.2s cold but 95.7s vs 83.2s cached, isomorphic
1.39× slower, and a bundle 14% *larger*). Profiling the build hook-by-hook
found the causes, all in the Enact integration rather than in Vite itself:

1. **Bundle size** — duplicated dependencies (iLib bundled twice, plus
   ramda/prop-types/classnames/warning/invariant once per `@enact/*` package)
   fixed via `resolve.dedupe`; and the generated entry was excluded from babel,
   so `useBuiltIns: 'entry'` never trimmed core-js — **483 core-js modules
   shipped instead of webpack's 77**. Together: 1263 KB → 1009 KB.
2. **iLib data copy** (~10s, 34% of the build): `ViteILibPlugin` copied the
   ~70 MB / 6,750-file locale tree with a synchronous `fs.cpSync` walk. Now an
   async pooled copy that skips already-current files.
3. **ESLint serialized ahead of the build** (~3–8s): the lint plugin `await`ed
   in `buildStart`. It now runs concurrently and is awaited in `closeBundle`
   (errors still fail the build).
4. **No babel cache**: `@vitejs/plugin-react` has no `cacheDirectory`
   equivalent, so all ~380 app + raw `@enact/*` files re-transpiled every build
   — also why cached builds barely improved. A content-keyed memory+disk cache
   now wraps the transform (`node_modules/.cache/enact-vite-babel`).
5. **Isomorphic ran its two builds sequentially**, and the SSR build also
   copied the iLib tree into the throwaway `.enact-ssr` dir. The builds now run
   concurrently (`Promise.all`) and the SSR copy is dropped (its `ILIB_*`
   defines are kept — prerendering reads locale data from source).

Also measured and **rejected**: `build.reportCompressedSize: false` (no effect —
Vite already skips it at `logLevel: 'warn'`), and dev-build sourcemaps as a
suspect (26.8s with vs 27.4s without — free). Two earlier wrong conclusions
were traced to machine drift in sequential benchmarking: a phantom "24s Terser
cost" (really ~3s, interleaved) and the old serve figures, which — worse — were
measured against a dev server that reported ready but never actually rendered
(three now-fixed bugs: CJS shims served where ESM was needed, an undefined
`ENACT_PACK_ISOMORPHIC` global, and a failed dependency pre-scan).

**Minifier choice**: Terser remains the default (matches webpack quality;
286 KB vs 303 KB gzip against esbuild's minifier) and costs only ~3s since Vite
parallelizes it. `ENACT_VITE_MINIFY=esbuild` opts into the faster minifier.

## Notes

**Note 1 — `--no-minify` is not comparable; the webpack flag is a silent no-op.**
Re-verified: webpack's `main.js` is byte-identical with and without it
(1108 KB, gzip 314 KB), while Vite's grows 2.5× as expected (1009 → 2543 KB).
Cause: `terser-webpack-plugin@5` normalizes constructor options into
`options.minimizer.options`, but `dev-utils/mixins/unmangled.js` writes to
`options.terserOptions` — a key v5 never reads, so `mangle` stays
`{safari10:true}`. A pre-existing webpack-path bug, unrelated to the migration.

**Note 2 — `-l` means different things in the two bundlers.** `locales` appears
nowhere in webpack's `ILibPlugin`: there, `-l` scopes prerendering only (matching
`pack --help`: "Locales for isomorphic mode") and the full iLib tree always
ships. `ViteILibPlugin` additionally trims the emitted locale data — hence
**2013 files / 18.7 MB vs 6782 / 59.7 MB (69% smaller)**. Attractive for a TV
app, but a behavioural deviation: a webpack build made with `-l en-US,ko-KR` can
still switch to any locale at runtime, whereas the Vite build ships no data for
unlisted locales and falls back to unlocalized output. (Shared non-locale data
such as `localematch.json` is kept, so it degrades rather than crashes.)

## Caveats, honestly

1. **Build timings on this machine are load-sensitive.** Earlier passes of this
   same benchmark, taken while background work was running, produced 2–3×
   slower figures for *both* bundlers. Only compare numbers from a single run
   (bundlers are interleaved per row precisely so the within-row comparison
   survives drift), and treat build-time differences under ~20% as noise.
   Output sizes are deterministic and safe to compare across sessions.
2. **`--snapshot` did not emit a blob**: `V8_MKSNAPSHOT` is not set in this
   environment, so both bundlers build the app and skip blob generation. The row
   measures build cost, not `mksnapshot` cost.
3. Peak memory covers the build process and its esbuild children, not webpack's
   parallel Terser workers, so webpack's true peak is somewhat understated.
   Vite's `-i`/`--snapshot` peaks reflect the two concurrent builds — the
   deliberate time-for-memory trade described above.

## Reproducing

```bash
cd limestone/samples/qa-a11y
rm -rf node_modules/.cache node_modules/.vite dist   # clears both bundlers' caches
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p          # webpack
NODE_OPTIONS=--max-old-space-size=8192 enact pack -p --vite   # vite
NODE_OPTIONS=--max-old-space-size=8192 enact serve            # webpack
NODE_OPTIONS=--max-old-space-size=8192 enact serve --vite     # vite
# optional faster minifier (+17 KB gzip):
ENACT_VITE_MINIFY=esbuild NODE_OPTIONS=--max-old-space-size=8192 enact pack -p --vite
```
