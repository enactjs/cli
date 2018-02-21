const cp = require('child_process');

function api(args) {
	if (args[0] === 'start' || args[0] === 'init') {
		args.splice(1, 0, require.resolve('../config/karma.conf.js'));
	}
	return new Promise((resolve, reject) => {
		const child = cp.fork(require.resolve('karma/bin/karma'), args, {env: process.env, cwd: process.cwd()});
		child.on('close', code => {
			if (code !== 0) {
				reject();
			} else {
				resolve();
			}
		});
	});
}

function cli(args) {
	api(args).catch(() => {
		process.exit(1);
	});
}

module.exports = {api, cli};
