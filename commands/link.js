// @remove-file-on-eject
const path = require('path');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact link';

	console.log('  Usage');
	console.log(`    ${e} [options] [target]`);
	console.log();
	console.log('  Arguments');
	console.log('    target            Optional target file or directory');
	console.log('                          (default: cwd)');
	console.log();
	console.log('  Options');
	console.log('    --loglevel        NPM log level to output');
	console.log('    --verbose         Verbose output logging');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function globalModules(cwd) {
	return new Promise(resolve => {
		let prefix = '';
		const proc = spawn('npm', ['config', 'get', 'prefix', '-g'], {
			stdio: 'pipe',
			cwd,
			env: process.env
		});
		proc.stdout.on('data', data => {
			prefix += data.toString().replace(/\n/g, '');
		});
		proc.on('close', code => {
			if (code !== 0 || !prefix) {
				resolve(require('global-modules'));
			} else if (process.platform === 'win32' || ['msys', 'cygwin'].includes(process.env.OSTYPE)) {
				resolve(path.resolve(prefix, 'node_modules'));
			} else {
				resolve(path.resolve(prefix, 'lib/node_modules'));
			}
		});
	});
}

function api({cwd = process.cwd(), loglevel = 'error', verbose = false} = {}) {
	const linkArgs = ['--loglevel', verbose ? 'verbose' : loglevel, 'link'];
	const pkg = packageRoot(cwd);
	let enact = Object.keys(pkg.meta.dependencies || {}).concat(Object.keys(pkg.meta.devDependencies || {}));
	enact = enact.filter(d => d.startsWith('@enact/')).map(d => d.replace('@enact/', ''));

	return globalModules(cwd).then(globalDir => {
		return new Promise((resolve, reject) => {
			const missing = [];
			for (let i = 0; i < enact.length; i++) {
				if (fs.existsSync(path.join(globalDir, '@enact', enact[i]))) {
					linkArgs.push('@enact/' + enact[i]);
				} else {
					missing.push('@enact/' + enact[i]);
				}
			}

			if (enact.length === 0) {
				reject(new Error('No Enact dependencies found within the package. Nothing to link.'));
			} else if (missing.length === enact.length) {
				reject(new Error('Enact global modules not found. Ensure they are linked correctly.'));
			} else {
				const proc = spawn('npm', linkArgs, {stdio: 'inherit', cwd});
				proc.on('close', code => {
					if (code !== 0) {
						reject(new Error('"npm ' + linkArgs.join(' ') + '" failed'));
					} else {
						resolve();
					}
				});
			}
		});
	});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['verbose', 'help'],
		string: ['loglevel'],
		alias: {h: 'help'}
	});
	if (opts.help) displayHelp();

	if (opts._[0]) opts.cwd = opts._[0];

	api(opts).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
