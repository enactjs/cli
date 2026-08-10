/* eslint no-console: off, no-undef: off */
/* eslint-env node, es6 */
/**
 * `--verbose` for `enact pack --esbuild`. Webpack's counterpart
 * (mixins/verbose.js + VerboseLogPlugin) drives a live-updating progress
 * line off webpack's ProgressPlugin percentage callbacks, plus a couple of
 * extra status lines during prerendering/snapshot stages. esbuild has no
 * equivalent per-module progress-percentage API — its builds are typically
 * fast enough that this isn't really a gap — so a literal port doesn't make
 * sense. Instead this surfaces per-stage timing and detail across the
 * esbuild pack/isomorphic pipeline: which stages ran, how long each took,
 * and (for isomorphic) which locales deduped against each other — the same
 * underlying question ("what's happening, and where's the time going") the
 * original plugin answers, just via a different mechanism appropriate to
 * how esbuild actually reports its own progress (i.e. not at all, so we
 * time it ourselves).
 */
function createVerboseLogger (enabled, chalk) {
	const start = Date.now();
	let stageStart = start;
	let stageName = null;

	return {
		enabled,

		// Marks the start of a named stage (e.g. "Building client bundle").
		stage (message) {
			if (!enabled) return;
			const elapsed = ((Date.now() - start) / 1000).toFixed(2);
			console.log(chalk.magenta(`  [+${elapsed}s]`) + ' ' + message);
			stageStart = Date.now();
			stageName = message;
		},

		// Marks the end of the most recently started stage, with an optional
		// extra detail string (module count, dedup summary, etc.).
		stageDone (detail) {
			if (!enabled) return;
			const ms = Date.now() - stageStart;
			console.log(chalk.gray(`    done in ${ms}ms`) + (detail ? chalk.gray(' — ') + detail : ''));
			stageName = null;
		},

		// Freeform detail line within the current stage, not itself timed.
		detail (message) {
			if (!enabled) return;
			console.log(chalk.gray('    ' + message));
		},

		// Total elapsed time since this logger was created.
		total () {
			if (!enabled) return;
			console.log(chalk.magenta(`  [+${((Date.now() - start) / 1000).toFixed(2)}s]`) + ' Done.');
		}
	};
}

module.exports = {createVerboseLogger};