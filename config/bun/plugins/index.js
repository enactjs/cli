const {createBabelEnactPlugin} = require('./babel-enact');
const {createLessEnactPlugin} = require('./less-enact');
const {createResolveEnactPlugin} = require('./resolve-enact');
const {createFrameworkExclusionsPlugin} = require('./framework-exclusions');
const {createExternalsEnactPlugin} = require('./externals-enact');
const {createIsomorphicEnactPlugin} = require('./isomorphic-enact');
const {createEslintEnactPlugin} = require('./eslint-enact');
const {createSnapshotEnactPlugin} = require('./snapshot-enact');
const {createCaseSensitiveEnactPlugin} = require('./case-sensitive-enact');
const {createTypescriptEnactPlugin} = require('./typescript-enact');

function createEnactPlugins (options = {}) {
	const plugins = [];

	if (options.framework) {
		plugins.unshift(createFrameworkExclusionsPlugin({context: options.context}));
	}

	const eslintPlugin = createEslintEnactPlugin(options);
	if (eslintPlugin) {
		plugins.push(eslintPlugin);
	}

	const typescriptPlugin = createTypescriptEnactPlugin(options);
	if (typescriptPlugin) {
		plugins.push(typescriptPlugin);
	}

	const caseSensitivePlugin = createCaseSensitiveEnactPlugin(options);
	if (caseSensitivePlugin) {
		plugins.push(caseSensitivePlugin);
	}

	if (options.snapshot) {
		plugins.unshift(createSnapshotEnactPlugin(options));
	}

	plugins.push(
		createResolveEnactPlugin(options),
		createBabelEnactPlugin(options),
		createLessEnactPlugin(options)
	);

	if (options.useExternals) {
		plugins.unshift(createExternalsEnactPlugin(options.externalsOptions));
	}

	if (options.isomorphic && !options.useExternals) {
		plugins.unshift(createIsomorphicEnactPlugin({
			isomorphic: true,
			globalName: 'App',
			useExternals: false
		}));
	}

	return plugins;
}

module.exports = {
	createEnactPlugins,
	createBabelEnactPlugin,
	createLessEnactPlugin,
	createFrameworkExclusionsPlugin,
	createExternalsEnactPlugin,
	createIsomorphicEnactPlugin,
	createEslintEnactPlugin,
	createSnapshotEnactPlugin,
	createCaseSensitiveEnactPlugin,
	createTypescriptEnactPlugin
};
