const cp = require('child_process');

module.exports = function(args) {
	if(args[0]==='start' || args[0]==='init') {
		args.splice(1, 0, require.resolve('../config/jest.conf.js'));
	}

	// TODO: Move this to jest.conf.js
	const config = JSON.stringify({
		testRegex: '-specs.jsx?$',
		verbose: false,
		transform: {'.*': require.resolve('../config/jest.transform')},
		transformIgnorePatterns: ['node_modules.(?!@enact)'],
		setupTestFrameworkScriptFile: require.resolve('../config/jestTestSetup'),
		moduleNameMapper: {
			enzyme: require.resolve('enzyme'),
			sinon: require.resolve('sinon'),
			'enyo-console-spy': require.resolve('enyo-console-spy'),
			'ilibmanifest.json': 'ilib',
			'\\.(css|less)$': require.resolve('identity-obj-proxy')
		}
	});

	args.push('--config', config);
	const child = cp.fork(require.resolve('jest/bin/jest'), args, {env:process.env, cwd:process.cwd()});
	child.on('close', code => {
		process.exit(code);
	});
};
