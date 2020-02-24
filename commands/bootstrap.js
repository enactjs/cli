// @remove-file-on-eject
const path = require('path');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;
const link = require('./link').api;

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact bootstrap';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    --loglevel        NPM log level to output');
	console.log('    --verbose         Verbose output logging');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function npmExec(args, cwd = process.cwd(), loglevel) {
	return new Promise((resolve, reject) => {
		if (loglevel) args.unshift('--loglevel', loglevel);
		const child = spawn('npm', args, {stdio: 'inherit', cwd});
		child.on('close', code => {
			if (code !== 0) {
				reject(new Error('Failed to ' + args[args.length - 1] + ': ' + path.basename(cwd)));
			} else {
				resolve();
			}
		});
	});
}

function newline() {
	console.log();
}

function api({cwd = process.cwd(), loglevel = 'error', verbose = false} = {}) {
	const pkg = packageRoot(cwd);
	const scripts = pkg.meta.scripts || {};

	if (verbose) loglevel = 'verbose';

	if (scripts.bootstrap && scripts.bootstrap !== 'enact bootstrap') {
		return npmExec(['run', 'bootstrap'], pkg.path, loglevel);
	} else {
		return Promise.resolve()
			.then(() => {
				const samples = path.join(pkg.path, 'samples');
				if (fs.existsSync(samples)) {
					return fs
						.readdirSync(samples)
						.map(p => path.join(samples, p))
						.filter(p => fs.existsSync(path.join(p, 'package.json')))
						.reduce((result, p) => {
							return result.then(() => api({cwd: p, loglevel, verbose}));
						}, Promise.resolve());
				}
			})
			.then(() => {
				console.log('Installing dependencies for', pkg.meta.name);
				return npmExec(['install'], pkg.path, loglevel).then(newline);
			})
			.then(() => {
				console.log('Symlinking Enact dependencies for', pkg.meta.name);
				return link({cwd: pkg.path, loglevel, verbose}).then(newline);
			});
	}
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['verbose', 'help'],
		string: ['loglevel'],
		alias: {h: 'help'}
	});
	if (opts.help) displayHelp();

	api(opts).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
