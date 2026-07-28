/* eslint-env node, es6 */

function isEsbuildBundler (opts) {
	return Boolean(opts.esbuild) || /^esbuild$/i.test(process.env.ENACT_BUNDLER || '');
}

module.exports = {isEsbuildBundler};
