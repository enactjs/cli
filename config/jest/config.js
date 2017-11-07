module.exports = {
	testRegex: '-specs.jsx?$',
	verbose: false,
	rootDir: process.cwd(),
	transform: {
		'.*': require.resolve('./transform')
	},
	transformIgnorePatterns: ['node_modules.(?!@enact)'],
	setupTestFrameworkScriptFile: require.resolve('./test-setup'),
	moduleNameMapper: {
		enzyme: require.resolve('enzyme'),
		sinon: require.resolve('sinon'),
		'console-snoop': require.resolve('console-snoop'),
		'ilibmanifest.json': 'ilib',
		'\\.(css|less)$': require.resolve('identity-obj-proxy')
	}
};
