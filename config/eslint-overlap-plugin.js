/* eslint no-console: off */
/**
 * ESLintOverlapPlugin — replacement for `eslint-webpack-plugin` that runs
 * ESLint as a separate, genuinely concurrent child process instead of
 * in-process work gated behind webpack's own module graph.
 *
 * Why: per-hook profiling of `enact pack -p` (webpack path) showed
 * eslint-webpack-plugin's `processAssets` wait as the single largest atomic
 * chunk of the whole build (~5.5s on a cold qa-a11y build) — bigger than
 * either TerserPlugin or CssMinimizerPlugin individually. The library only
 * calls its linter at `compilation.hooks.finishModules` (see its source),
 * i.e. after webpack has already finished building the entire module graph,
 * so there's almost nothing left for it to overlap with — the ~5.5s of lint
 * work lands squarely in the build's critical path.
 *
 * The fix: kick ESLint off as EARLY as possible
 * (`compiler.hooks.run`/`watchRun`, before a single module has
 * built) as its own child process, and only await it right before assets are
 * finalized (`processAssets`, the same stage the original plugin used, so
 * plugin ordering relative to ILibPlugin/etc. is unaffected). Lint work then
 * overlaps with module building + sealing + minification instead of
 * serializing after it — by the time processAssets is reached the child has
 * often already finished, so the await is close to free.
 *
 * The child's exit code IS checked, so this plugin fails the build on lint
 * errors in non-development mode, matching eslint-webpack-plugin's own
 * default (`failOnError: mode !== 'development'`) — production builds keep
 * failing on real lint errors.
 */
const {spawn} = require('child_process');
const path = require('path');
const resolve = require('resolve');

function resolveBin (pkgName, relativeBinPath, basedir) {
	const pkgJsonPath = resolve.sync(`${pkgName}/package.json`, {basedir});
	return path.join(path.dirname(pkgJsonPath), relativeBinPath);
}

class ESLintOverlapPlugin {
	constructor (options = {}) {
		this.key = 'ESLintOverlapPlugin';
		this.formatter = options.formatter;
		this.configFile = options.overrideConfigFile;
		this.failOnError = options.failOnError;
		this.cache = options.cache;
	}

	apply (compiler) {
		const failOnError =
			typeof this.failOnError === 'boolean' ? this.failOnError : compiler.options.mode !== 'development';

		// `run` covers a one-shot pack; `watchRun` covers `serve`/`--watch`'s
		// repeated compiles — mirrors eslint-webpack-plugin's own dual tap.
		let pending = null;
		const start = () => {
			if (pending) return pending;
			pending = new Promise(resolvePromise => {
				const eslintBin = resolveBin('eslint', 'bin/eslint.js', __dirname);
				// ESLint 9's flat config has no `--ext` flag; file patterns are
				// passed as glob arguments instead.
				const args = [eslintBin, 'src/**/*.{js,mjs,jsx,ts,tsx}'];
				if (this.configFile) args.push('--config', this.configFile);
				if (this.formatter) args.push('--format', this.formatter);
				if (this.cache) {
					args.push('--cache', '--cache-location', path.join('node_modules', '.cache', 'eslint-overlap.cache'));
				}
				const child = spawn(process.execPath, args, {stdio: 'inherit', cwd: compiler.options.context});
				child.on('error', err => {
					console.warn('ESLint failed to start:', err.message);
					resolvePromise({code: null});
				});
				child.on('exit', code => resolvePromise({code}));
			});
			return pending;
		};

		compiler.hooks.run.tapPromise(this.key, async () => {
			start();
		});
		compiler.hooks.watchRun.tapPromise(this.key, async () => {
			// A fresh compile (not the first) needs a fresh lint pass; a run
			// already in flight from the previous compile is left to finish
			// (its result is stale by the time this compile's processAssets
			// reaches it, but re-spawning mid-flight would pile up processes).
			pending = null;
			start();
		});

		compiler.hooks.compilation.tap(this.key, compilation => {
			// HtmlWebpackPlugin (and others) run internal "child" compilations
			// that share this same Compiler's hooks — without this guard, the
			// eslint result gets pushed into the child's own `compilation.errors`
			// too, which webpack then reports as a separate "Child compilation
			// failed" wrapper around the same message. Only the top-level
			// compilation should carry the result.
			if (compilation.compiler.isChild()) return;
			const {Compilation} = require('webpack');
			compilation.hooks.processAssets.tapPromise(
				{name: this.key, stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE},
				async () => {
					const {code} = await (pending || start());
					if (code !== 0 && code !== null) {
						const message = `ESLint found problems in the project source (exit code ${code}). See the ESLint output above for details.`;
						if (failOnError) {
							compilation.errors.push(new Error(message));
						} else {
							compilation.warnings.push(new Error(message));
						}
					}
				}
			);
		});
	}
}

module.exports = ESLintOverlapPlugin;
