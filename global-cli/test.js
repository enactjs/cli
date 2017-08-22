const cp = require('child_process');

module.exports = function(args) {
	if(args[0]==='start' || args[0]==='init') {
		args.splice(1, 0, require.resolve('../config/karma.conf.js'));
	}
	const child = cp.fork(require.resolve('karma/bin/karma'), args, {env:process.env, cwd:process.cwd()});
	child.on('close', code => process.exit(code));
};
