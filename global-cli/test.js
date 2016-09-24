var
	cp = require('child_process'),
	path = require('path'),
	utils = require('../src/utils');

module.exports = function(args) {
	if(!utils.exists('./karma.conf.js')) {
		if(args[0]==='start' || args[0]==='init') {
			args.splice(1, 0, require.resolve('./internal/karma.js'));
		}
	}
	cp.fork(require.resolve('karma/bin/karma'), args, {env:process.env, cwd:process.cwd()});
};
