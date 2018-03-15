const path = require('path');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const globalDir = require('global-modules');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;

function displayHelp() {
	console.log('  Usage');
	console.log('    enact link [options]');
	console.log();
	console.log('  Options');
	console.log('    -verbose          Verbose output logging');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function api({verbose = false} = {}) {
	const linkArgs = ['--loglevel', verbose ? 'verbose' : 'error', 'link'];
	const pkg = packageRoot();
	let enact = Object.keys(pkg.meta.dependencies || {}).concat(Object.keys(pkg.meta.devDependencies || {}));
	enact = enact.filter(d => d.startsWith('@enact/')).map(d => d.replace('@enact/', ''));

	return new Promise((resolve, reject) => {
		const missing = [];
		for (let i = 0; i < enact.length; i++) {
			if (fs.existsSync(path.join(globalDir, '@enact', enact[i]))) {
				linkArgs.push('@enact/' + enact[i]);
			} else {
				missing.push('@enact/' + enact[i]);
			}
		}

		if (missing.length === enact.length) {
			reject(new Error('Unable to detect any Enact global modules. Please ensure they are linked correctly.'));
		} else {
			const proc = spawn('npm', linkArgs, {stdio: 'inherit', cwd: process.cwd()});
			proc.on('close', code => {
				if (code !== 0) {
					reject(new Error('"npm ' + linkArgs.join(' ') + '" failed'));
				} else {
					resolve();
				}
			});
		}
	});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['verbose', 'help'],
		alias: {h: 'help'}
	});
	opts.help && displayHelp();

	api(opts).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
