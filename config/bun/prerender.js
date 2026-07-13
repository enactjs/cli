const {resolveDevUtilsModule} = require('./resolve-dev-utils');

function resolveApplyBunPostBuild () {
	try {
		const PrerenderPlugin = require('@enact/dev-utils/plugins/PrerenderPlugin');
		if (typeof PrerenderPlugin.applyBunPostBuild === 'function') {
			return PrerenderPlugin.applyBunPostBuild;
		}
	} catch (e) {
		// continue
	}

	const prerender = resolveDevUtilsModule('bun-plugins/prerender');
	if (prerender && typeof prerender.applyPrerender === 'function') {
		return prerender.applyPrerender;
	}

	const localPlugin = resolveDevUtilsModule('plugins/PrerenderPlugin');
	if (localPlugin && typeof localPlugin.applyBunPostBuild === 'function') {
		return localPlugin.applyBunPostBuild;
	}

	return null;
}

function applyPrerender (options = {}) {
	const applyBunPostBuild = resolveApplyBunPostBuild();
	if (!applyBunPostBuild) {
		throw new Error(
			'Prerender is unavailable. Install @enact/dev-utils with Bun support or use a linked dev-utils workspace.'
		);
	}
	return applyBunPostBuild(options);
}

module.exports = {applyPrerender, resolveApplyBunPostBuild};
