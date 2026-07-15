const path = require('path');
const spawn = require('cross-spawn');
const {resolveBun} = require('./resolve-bun');

function spawnBunScript (script, args = [], opts = {}) {
	const bun = resolveBun();
	const scriptPath = path.join(__dirname, script);
	const spawnOpts = {
		stdio: 'inherit',
		cwd: opts.cwd || process.cwd(),
		env: {...process.env, ENACT_NODE: process.execPath, ...opts.env}
	};

	return new Promise((resolve, reject) => {
		const child = spawn(bun, [scriptPath, ...args], spawnOpts);
		child.on('close', code => {
			if (code !== 0) {
				reject(new Error(`Bun exited with code ${code}`));
			} else {
				resolve();
			}
		});
		child.on('error', reject);
	});
}

module.exports = {spawnBunScript, resolveBun};
