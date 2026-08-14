/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `enact pack --esbuild --framework`: builds the shared @enact/react/ilib
 * surface as a reusable ESM bundle (addressed by an import map) + a manifest,
 * for `--externals` to later externalize app builds against. esbuild
 * counterpart to `pack.js`'s `viteFramework`.
 *
 * Reuses the bundler-agnostic pieces of `@enact/dev-utils/mixins/vite-framework`
 * as-is (enumerateSpecifiers/enumerateSelfSpecs/writeWrappers/writeManifest are
 * plain filesystem/string operations with no Rollup coupling — same reuse
 * pattern esbuild-isomorphic.js uses for PrerenderPlugin's FileXHR/templates).
 * Only the two functions that mutate a *Vite* config (`applyFramework`,
 * `applyExternals`) have no esbuild equivalent and are reimplemented here
 * against esbuild's build-options shape instead (see esbuild-externals.js for
 * the externals half).
 */
const path = require('path');
const fs = require('fs-extra');
const {optionParser: app} = require('@enact/dev-utils');
// Tolerant load, same reasoning/pattern as esbuild-pack.js and pack.js. Unlike
// those, --framework needs viteFw for its entire body, so this module is only
// ever require()'d lazily from within esbuild-pack.js's `if (opts.framework)`
// branch — a missing mixin here only breaks --framework, not every pack call.
let viteFw;
try {
	viteFw = require('@enact/dev-utils/mixins/vite-framework');
} catch (e) {
	// Optional; see above. esbuildFramework() throws a clear error below.
}

const FRAMEWORK_CSS = 'enact.css';
const DROP_PLUGIN_NAMES = new Set([
	// No app HTML/webOS metadata to emit for a bundle that isn't an app.
	'enact-esbuild-html',
	'enact-esbuild-webosmeta',
	// Type-checking/linting the auto-generated `.enact-framework-src` wrapper
	// files would just be noise; the real source they re-export was already
	// checked when its own package built.
	'enact-ts-typecheck',
	'enact-eslint'
]);

async function esbuildFramework (opts, chalk, esbuild, configFactory) {
	if (!viteFw) {
		throw new Error(
			'--framework requires @enact/dev-utils/mixins/vite-framework, which is not available. ' +
			'Update @enact/dev-utils to a version that includes it.'
		);
	}
	const {createRequire} = require('module');
	const appRequire = createRequire(path.join(app.context, 'package.json'));

	const specs = viteFw.enumerateSpecifiers(app.context, {polyfill: opts['externals-polyfill']});
	// Building --framework inside a theme repo: also include the theme's own
	// components (webpack's `libraries.push('.')`), which aren't reachable
	// under node_modules/@enact.
	const self = viteFw.enumerateSelfSpecs(app.context);
	const allSpecs = self ? specs.concat(self.specs.filter(s => !specs.includes(s))) : specs;
	const selfSet = self ? new Set(self.specs) : null;
	const srcDir = path.join(app.context, '.enact-framework-src');
	const {input, names} = viteFw.writeWrappers(allSpecs, srcDir, appRequire, selfSet);

	const outDir = opts.output ? path.resolve(opts.output) : path.resolve('./dist');
	const buildOptions = configFactory(opts.production ? 'production' : 'development', !opts.linting);

	buildOptions.entryPoints = input;
	buildOptions.outdir = outDir;
	// esbuild's multi-entry ESM output needs code splitting to share modules
	// (react/ilib/etc.) across the dozens of per-specifier wrapper entries —
	// the esbuild analog of Rollup's automatic shared-chunk extraction.
	buildOptions.format = 'esm';
	buildOptions.splitting = true;
	// `chunkNames` defaults to `chunk.[name]` (no hash) — fine for a
	// single-entry app build, but a framework build's dozens of entries
	// produce dozens of shared chunks whose `[name]` esbuild derives the same
	// way for more than one of them, so without a uniquifying hash multiple
	// *different* chunks collide on one output path ("Two output files share
	// the same path but have different contents"). Always hash here,
	// independent of `--content-hash` (which only controls the entry files).
	buildOptions.chunkNames = 'chunk.[name]-[hash]';
	buildOptions.plugins = buildOptions.plugins.filter(p => !DROP_PLUGIN_NAMES.has(p.name));

	if (self) {
		// Theme-repo self-inclusion: resolve `@enact/<theme>` (root + subpaths)
		// to the repo root, since it isn't under the repo's own node_modules.
		buildOptions.alias = Object.assign({}, buildOptions.alias, {[self.name]: self.root});
	}

	// --no-minify (private): same override as the plain esbuild pack path.
	if (!opts.minify) {
		buildOptions.minify = false;
		buildOptions.plugins = buildOptions.plugins.filter(p => p.name !== 'enact-terser');
	}

	if (opts.verbose) {
		const {esbuildVerbosePlugin} = require('./esbuild-verbose');
		buildOptions.plugins = buildOptions.plugins.concat([esbuildVerbosePlugin()]);
	}

	console.log(`Creating the Enact framework bundle (${Object.keys(input).length} modules)...`);
	await fs.emptyDir(outDir);
	const result = await esbuild.build(buildOptions);

	// esbuild has no Rollup-style `cssCodeSplit: false` — it emits one CSS file
	// per entry/chunk that pulls in styles. Concatenate them into the single
	// `enact.css` an import-map consumer expects (matches FRAMEWORK_CSS in
	// vite-framework.js, so `writeManifest` below finds it the same way).
	const cssOutputs = Object.keys((result.metafile && result.metafile.outputs) || {})
		.filter(f => f.endsWith('.css'))
		.sort();
	if (cssOutputs.length) {
		const combined = cssOutputs.map(f => fs.readFileSync(path.resolve(f), 'utf8')).join('\n');
		fs.writeFileSync(path.join(outDir, FRAMEWORK_CSS), combined);
		cssOutputs.forEach(f => fs.removeSync(path.resolve(f)));
	}

	const manifest = viteFw.writeManifest(outDir, names);
	fs.removeSync(srcDir);

	if (opts.stats) {
		const {writeEsbuildStatsReport} = require('./esbuild-stats');
		const reportPath = writeEsbuildStatsReport(result.metafile, outDir, app.context);
		if (reportPath) console.log(chalk.dim(`Bundle stats written to ${path.relative(app.context, reportPath)}`));
	}

	console.log(chalk.green(`Framework compiled successfully. (${Object.keys(manifest.imports).length} specifiers)`));
}

module.exports = {esbuildFramework};
