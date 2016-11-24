const cp = require('child_process');

module.exports = function(args) {
	if(args[0]==='start' || args[0]==='init') {
		const jestArgs = require('../config/jest.conf.js');
		args.splice(0, 1, ...jestArgs);
	}

	const child = cp.fork(require.resolve('jest/bin/jest'), args, {env:process.env, cwd:process.cwd()});
	child.on('close', code => {
		process.exit(code);
	});
};
