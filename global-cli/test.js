var	cp = require('child_process');

module.exports = function(args) {
	if(args[0]==='start' || args[0]==='init') {
		args.splice(1, 0, require.resolve('../config/karma.conf.js'));
	}
	var child = cp.fork(require.resolve('karma/bin/karma'), args, {env:process.env, cwd:process.cwd()});
	child.on('close', function(code) {
		process.exit(code);
	});
};
