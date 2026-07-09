/* eslint-env node, es6 */
/**
 * Shared helpers for the experimental Vite bundler path, used by both the
 * `pack` and `serve` commands.
 */

// Whether the experimental Vite bundler is selected (via `--vite` or ENACT_BUNDLER=vite).
function useVite (opts) {
	return Boolean(opts.vite) || /^vite$/i.test(process.env.ENACT_BUNDLER || '');
}

module.exports = {useVite};
