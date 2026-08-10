/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `--externals` for `enact pack --esbuild` (plain and `--isomorphic` builds).
 * esbuild counterpart to `vite-framework.js`'s `applyExternals` — externalizes
 * the shared-framework specifiers a `--framework` build already provides, so
 * the app build doesn't bundle its own copy of them, then (via the reused
 * `injectHtml`) wires an import map + the framework stylesheet into the app's
 * emitted HTML.
 *
 * Manifest-aware like the Vite path: a specifier is only externalized if the
 * framework manifest actually emitted it, so an app whose imports the
 * framework doesn't cover still builds — the uncovered pieces stay bundled.
 *
 * Rollup's `external` accepts a predicate function evaluated per id; esbuild's
 * static `external` array can't express "only if the framework's manifest
 * covers it", so this uses an `onResolve` hook instead — the esbuild analog of
 * the same dynamic decision.
 *
 * One consequence of the format switch below that Vite's own ESM-by-default
 * output doesn't need to worry about: esbuild's other build modes emit a
 * plain `<script defer src="…">`, which cannot parse `import`/`export`
 * syntax — `markScriptsAsModule` patches those tags to `type="module"` after
 * the build so the externalized bundle actually loads.
 */
const fs = require('fs');
const path = require('path');
const {nonRuntimeEnactPackages} = require('@enact/dev-utils/mixins/framework-libraries');

const TOOL_PKGS = new Set(nonRuntimeEnactPackages);
const POLYFILL_SPEC = 'core-js/stable';

// Mirrors the unexported `isFrameworkSpec` predicate in vite-framework.js —
// not part of that module's public API, so reimplemented here against the
// same shared package list rather than duplicating the list itself.
function isFrameworkSpec (id) {
	if (/^react($|\/)/.test(id) || /^react-dom($|\/)/.test(id) || id === 'ilib') return true;
	const m = /^@enact\/([^/]+)/.exec(id);
	return Boolean(m) && !TOOL_PKGS.has(m[1]);
}

// Mutates `buildOptions` in place to externalize the framework's specifiers,
// recording which ones the app actually imports into `collected` (a Set the
// caller passes in, then reads after the build to drive `injectHtml`).
function applyEsbuildExternals (buildOptions, collected, manifest, opts = {}) {
	const inManifest = id => Boolean(manifest && manifest.imports && manifest.imports[id]);

	// Externalized bare specifiers only remain resolvable via a browser-native
	// import map under real ESM `<script type="module">` output — esbuild's
	// default IIFE bundling has no way to leave an unresolved `import` in
	// place (it would need a global-variable mapping instead, like webpack's
	// classic externals). This mirrors Vite's own output format, which is
	// ESM by default.
	buildOptions.format = 'esm';

	// --externals-polyfill: the framework provides core-js as one externalized
	// unit; if a `core-js` alias were present (there isn't one in the current
	// esbuild config, but this stays defensive against one being added later)
	// it would need dropping first so the bare specifier reaches this
	// resolver instead of getting inlined via the alias.
	if (opts.polyfill && inManifest(POLYFILL_SPEC) && buildOptions.alias) {
		delete buildOptions.alias['core-js'];
	}

	buildOptions.plugins = (buildOptions.plugins || []).concat([
		{
			name: 'enact-esbuild-externals',
			setup (build) {
				build.onResolve({filter: /.*/}, args => {
					const wanted = isFrameworkSpec(args.path) || (opts.polyfill && args.path === POLYFILL_SPEC);
					if (wanted && inManifest(args.path)) {
						collected.add(args.path);
						return {path: args.path, external: true};
					}
					return null;
				});
			}
		}
	]);

	return buildOptions;
}

// The public URLs of a build's JS outputs, in the same shape
// EsbuildHtmlPlugin computes them — shared here so callers can pass them to
// `markScriptsAsModule` without duplicating the metafile-to-URL math.
function jsAssetUrls (metafile, outdir, publicPath) {
	if (!metafile) return [];
	return Object.keys(metafile.outputs)
		.filter(f => f.endsWith('.js') && !f.endsWith('.map'))
		.map(f => `${publicPath}/${path.relative(outdir, path.resolve(f))}`.replace(/\\/g, '/'));
}

// Rewrites this build's own `<script defer src="…">` tags (as emitted by
// EsbuildHtmlPlugin) to `<script type="module" defer src="…">` — required
// whenever `applyEsbuildExternals` has switched the build to ESM output,
// since a non-module script tag can't parse the resulting `import`/`export`
// syntax. `defer` is harmless (if redundant) alongside `type="module"`, so
// it's left in place rather than stripped.
function markScriptsAsModule (htmlPath, jsAssets) {
	if (!fs.existsSync(htmlPath)) return;
	let html = fs.readFileSync(htmlPath, 'utf8');
	jsAssets.forEach(src => {
		const tag = `<script defer src="${src}"></script>`;
		if (html.includes(tag)) {
			html = html.replace(tag, `<script type="module" defer src="${src}"></script>`);
		}
	});
	fs.writeFileSync(htmlPath, html);
}

module.exports = {applyEsbuildExternals, jsAssetUrls, markScriptsAsModule};
