const config = JSON.stringify({
	testRegex: '-specs.jsx?$',
	verbose: false,
	transform: {'.*': require.resolve('./jest.transform')},
	transformIgnorePatterns: ['node_modules.(?!@enact)'],
	setupTestFrameworkScriptFile: require.resolve('./jestTestSetup'),
	moduleNameMapper: {
		enzyme: require.resolve('enzyme'),
		sinon: require.resolve('sinon'),
		'console-snoop': require.resolve('console-snoop'),
		'ilibmanifest.json': 'ilib',
		'\\.(css|less)$': require.resolve('identity-obj-proxy')
	}
});

module.exports = ['--config', config];
