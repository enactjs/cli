/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `--verbose` for `enact pack --esbuild`. esbuild counterpart to
 * `mixins/vite-verbose` (vite.js's `verbosePlugin`) — narrates build-phase
 * transitions with a running module count, since (like Rollup) esbuild has no
 * up-front total to report a percentage against.
 */
function esbuildVerbosePlugin () {
	let modules = 0;
	return {
		name: 'enact-esbuild-verbose',
		setup (build) {
			build.onStart(() => {
				modules = 0;
				console.log('[verbose] build start — resolving & transforming modules…');
			});
			// onLoad fires once per module esbuild actually loads (i.e. parses),
			// the esbuild analog of Rollup's `moduleParsed`.
			build.onLoad({filter: /.*/}, () => {
				modules++;
				return null; // defer to the real loader; this hook only counts.
			});
			build.onEnd(result => {
				const outputs = (result.metafile && Object.keys(result.metafile.outputs)) || [];
				console.log(`[verbose] build end — ${modules} module(s) parsed, ${outputs.length} output file(s) emitted.`);
			});
		}
	};
}

module.exports = {esbuildVerbosePlugin};
