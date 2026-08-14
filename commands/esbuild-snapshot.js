/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `--snapshot` for `enact pack --esbuild` (implies `--isomorphic`; combined
 * with `--externals` is not supported — the snapshot must embed @enact, not
 * externalize it, matching the webpack/Vite paths' own
 * `opts.snapshot && !opts.externals` guard).
 *
 * Produces a self-contained bundle (no external imports) that mksnapshot's
 * bare V8 can execute top-level: it initializes react-dom/client against a
 * mock window (no real DOM exists yet), then assigns the app's default export
 * to `global.App`, which the on-device startup script reads after the
 * snapshot blob restores. `runMkSnapshot`/`writeSnapshotAppinfo` are reused
 * unchanged from `@enact/dev-utils/mixins/vite-snapshot` (plain
 * spawnSync/file-write helpers, no Rollup coupling); the substitution +
 * bundle-shape work below is esbuild-specific.
 *
 * The helper facade (`snapshot-mock.js`/`snapshot-helper-esm.js`) is already
 * plain ESM (written for the Vite path), so unlike vite-snapshot.js this
 * needs no "stage into node_modules so the commonjs transform applies" step —
 * esbuild bundles `import`/`export` from any location. Only the redirect (app
 * imports of `react-dom/client` → the facade, but the facade's own import of
 * the real module must NOT be redirected) needs an importer-aware resolve
 * hook, since esbuild's static `alias` can't distinguish importers the way
 * Rollup's `resolveId(source, importer)` can.
 */
const fs = require('fs');
const path = require('path');
// Tolerant load, same reasoning/pattern as esbuild-pack.js and pack.js: only
// needed by --snapshot. `applyEsbuildSnapshotBuild` below doesn't touch these
// (plain fs/path + the facade), so it stays usable either way; only the two
// functions re-exported at the bottom (called solely from esbuild-isomorphic.js's
// `opts.snapshot` branch) need the guard.
let viteSnap;
try {
	viteSnap = require('@enact/dev-utils/mixins/vite-snapshot');
} catch (e) {
	// Optional; see above. runMkSnapshot/writeSnapshotAppinfo throw a clear error if used without it.
}
function requireViteSnap () {
	if (!viteSnap) {
		throw new Error(
			'--snapshot requires @enact/dev-utils/mixins/vite-snapshot, which is not available. ' +
			'Update @enact/dev-utils to a version that includes it.'
		);
	}
	return viteSnap;
}
function runMkSnapshot (...args) {
	return requireViteSnap().runMkSnapshot(...args);
}
function writeSnapshotAppinfo (...args) {
	return requireViteSnap().writeSnapshotAppinfo(...args);
}

const HELPER_DIR = path.join(
	path.dirname(require.resolve('@enact/dev-utils/package.json')),
	'plugins',
	'SnapshotPlugin'
);
const FACADE_PATH = path.join(HELPER_DIR, 'snapshot-helper-esm.js');

// Optional deps the facade references; any that don't resolve in the app
// (absent package, or a missing subpath — e.g. a theme may lack
// `internal/$L`) fall back to a harmless no-op so its calls do nothing,
// matching "library not used". Mirrors vite-snapshot.js's OPTIONAL_LIBS.
const OPTIONAL_LIB_RE = /^(@enact\/i18n(\/|$)|@enact\/moonstone(\/|$)|@enact\/sandstone(\/|$)|@enact\/limestone(\/|$)|ilib(\/|$)|react-redux(\/|$)|fbjs(\/|$))/;

// See vite-snapshot.js for why this exact shim is needed (bare V8 has no
// `globalThis`/`Object.getOwnPropertyDescriptors`); reused verbatim via
// esbuild's `banner` option instead of a post-build chunk patch.
const SNAPSHOT_PRELUDE =
	'var global=typeof global!=="undefined"?global:' +
	'(typeof globalThis!=="undefined"?globalThis:(typeof self!=="undefined"?self:Function("return this")()));' +
	'if(typeof globalThis==="undefined"){try{global.globalThis=global;}catch(e){}}' +
	'if(!Object.getOwnPropertyDescriptors){Object.getOwnPropertyDescriptors=function(o){' +
	'var r={},k=Object.getOwnPropertyNames(o),s=Object.getOwnPropertySymbols?Object.getOwnPropertySymbols(o):[],i;' +
	'for(i=0;i<k.length;i++)r[k[i]]=Object.getOwnPropertyDescriptor(o,k[i]);' +
	'for(i=0;i<s.length;i++)r[s[i]]=Object.getOwnPropertyDescriptor(o,s[i]);return r;};}\n';

function norm (p) {
	try {
		return fs.realpathSync(p).replace(/\\/g, '/');
	} catch (e) {
		return path.resolve(p).replace(/\\/g, '/');
	}
}

// Resolves `react-dom/client` → the facade for every importer except the
// facade's own self-import (which must reach the real module), and resolves
// the facade's optional Enact/i18n/locale deps to a no-op when not installed.
function esbuildSnapshotResolvePlugin () {
	const facade = norm(FACADE_PATH);
	const noopContents = 'module.exports = new Proxy(function(){}, {get: function(){ return function(){}; }});';

	return {
		name: 'enact-esbuild-snapshot-resolve',
		setup (build) {
			build.onResolve({filter: /^react-dom\/client$/}, args => {
				if (norm(args.importer) === facade) return null; // let the facade's own import resolve for real
				return {path: FACADE_PATH};
			});

			build.onResolve({filter: OPTIONAL_LIB_RE}, args => {
				if (norm(args.importer) !== facade) return null; // only guard the facade's own imports
				try {
					require.resolve(args.path, {paths: [HELPER_DIR]});
					return null; // resolves fine; let esbuild handle it normally
				} catch (e) {
					return {path: args.path, namespace: 'enact-snapshot-noop'};
				}
			});
			build.onLoad({filter: /.*/, namespace: 'enact-snapshot-noop'}, () => ({
				contents: noopContents,
				loader: 'js'
			}));
		}
	};
}

// Writes the throwaway snapshot entry: imports the app's default export and
// assigns it directly to `global.App` — deliberately a plain assignment
// rather than an ESM `export default` re-export, since esbuild's IIFE
// `globalName` wraps the module's export *namespace* (`{default: ...}`)
// rather than unwrapping a lone default export the way Rollup's UMD output
// does; a direct assignment sidesteps that difference and matches the raw,
// unwrapped `window.App` shape the on-device startup script expects from the
// other bundlers.
function createSnapshotEntry (dir, appEntry) {
	fs.mkdirSync(dir, {recursive: true});
	const file = path.join(dir, 'snapshot-entry.js');
	// This entry file is written under the *app's* node_modules/.cache, so a
	// bare `import 'core-js/stable'` would resolve (or fail to) against the
	// app's own dependency tree, walking up from a directory the app's real
	// node_modules isn't even an ancestor of. `config/polyfills.js` (used by
	// every other build path) sidesteps this the same way esbuild's `inject`
	// option already does: resolve core-js relative to the CLI itself, not
	// the app, since it's the CLI's dependency.
	let corejsImport = '';
	if (!process.env.ENACT_SNAPSHOT_NO_COREJS) {
		const corejsPath = require.resolve('core-js/stable');
		corejsImport = `import ${JSON.stringify(corejsPath)};\n`;
	}
	const body =
		`import ${JSON.stringify(FACADE_PATH)};\n` +
		corejsImport +
		`import __app from ${JSON.stringify(path.resolve(appEntry))};\n` +
		'globalThis.App = __app;\n';
	fs.writeFileSync(file, body);
	return file;
}

// Mutates an isomorphic client `buildOptions` into the self-contained IIFE
// snapshot build. `context`/`appEntry` mirror vite-snapshot.js's signature.
function applyEsbuildSnapshotBuild (buildOptions, {context, appEntry}) {
	const entryDir = path.join(context, 'node_modules', '.cache', 'enact-esbuild', 'snapshot');
	const snapshotEntry = createSnapshotEntry(entryDir, appEntry);

	buildOptions.entryPoints = {main: snapshotEntry};
	// Self-contained single file: no code splitting, no chunk boundaries to
	// worry about lining up with what mksnapshot executes.
	buildOptions.format = 'iife';
	delete buildOptions.splitting;
	buildOptions.banner = Object.assign({}, buildOptions.banner, {js: SNAPSHOT_PRELUDE});
	// The snapshot must parse in the target board's V8. By default the app's
	// browserslist-derived target drives the output (matches modern webOS
	// firmware). Only for a much OLDER firmware than the app targets does the
	// bundler-generated helper code need extra lowering.
	if (process.env.V8_SNAPSHOT_TARGET) buildOptions.target = process.env.V8_SNAPSHOT_TARGET;
	buildOptions.plugins = (buildOptions.plugins || []).concat([esbuildSnapshotResolvePlugin()]);

	return buildOptions;
}

module.exports = {applyEsbuildSnapshotBuild, runMkSnapshot, writeSnapshotAppinfo};
