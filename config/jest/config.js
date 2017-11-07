module.exports = {
	testRegex: '-specs.jsx?$',
	verbose: false,
	rootDir: process.cwd(),
	transform: {
		'.*': require.resolve('./transform')
	},
	transformIgnorePatterns: [
		'node_modules.(?!@enact)'
	],
	setupFiles: [
		require.resolve('../polyfills.js')
	],
	setupTestFrameworkScriptFile: require.resolve('./test-setup'),
	moduleNameMapper: {
		enzyme: require.resolve('enzyme'),
		sinon: require.resolve('sinon'),
		'console-snoop': require.resolve('console-snoop'),
		'\\.(css|less)$': require.resolve('identity-obj-proxy')
	},
	globals: {
		__DEV__: true,
		ILIB_BASE_PATH: 'node_modules/@enact/i18n/ilib',
		ILIB_MOONSTONE_PATH: 'node_modules/@enact/moonstone/resources',
		ILIB_RESOURCES_PATH: 'resources',
		ILIB_CACHE_ID: String(new Date().getTime())
	}
};
