// @remove-file-on-eject
const path = require('path');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;
const doLink = require('./link').api;

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact bootstrap';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -b, --base        NPM install root level package');
	console.log('                      (enabled by default)');
	console.log('    -s, --sampler     NPM install sampler package');
	console.log('                      (enabled by default)');
	console.log('    -a, --allsamples  NPM install all sample packages');
	console.log('    -l, --link        After install, attempt to link any available');
	console.log('                      enact-scoped dependencies');
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

function api({
	cwd = process.cwd(),
	base = true,
	sampler = true,
	allsamples = false,
	link = true,
	loglevel = 'error',
	verbose = false
} = {}) {
	const pkg = packageRoot(cwd);

	if (verbose) loglevel = 'verbose';

	return Promise.resolve()
		.then(() => {
			// Root package install
			if (base) {
				console.log('Installing dependencies for', pkg.meta.name);
				return npmExec(['install'], pkg.path, loglevel).then(newline);
			}
		})
		.then(() => {
			// Run bootstrap npm command if present, otherwise attempt to detect
			// and install desired child packages (sampler, samples, etc.)
			const {scripts = {}} = pkg.meta;
			if (scripts.bootstrap && !scripts.bootstrap.startsWith('enact bootstrap')) {
				return npmExec(['run', 'bootstrap'], pkg.path, loglevel);
			} else {
				const samples = path.join(pkg.path, 'samples');
				if (fs.existsSync(samples)) {
					return fs
						.readdirSync(samples)
						.filter(p => (p === 'sampler' && sampler) || allsamples)
						.map(p => path.join(samples, p))
						.filter(p => fs.existsSync(path.join(p, 'package.json')))
						.reduce((result, p) => {
							return result.then(() =>
								api({
									cwd: p,
									base: true,
									sampler,
									allsamples,
									link,
									loglevel,
									verbose
								})
							);
						}, Promise.resolve());
				}
			}
		})
		.then(() => {
			// Link any global @enact/* packages that are dependencies for this package.
			if (link) {
				// no need to link if no @enact dependencies
				const {dependencies = {}, devDependencies = {}} = pkg.meta;
				const deps = Object.keys(Object.assign({}, dependencies, devDependencies));
				if (deps.some(d => d.startsWith('@enact'))) {
					console.log('Symlinking Enact dependencies for', pkg.meta.name);
					return doLink({cwd: pkg.path, loglevel, verbose}).then(newline);
				}
			}
		});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['base', 'sampler', 'allsamples', 'link', 'verbose', 'help'],
		string: ['loglevel'],
		default: {base: true, sampler: true, link: true},
		alias: {b: 'base', s: 'sampler', a: 'allsamples', l: 'link', h: 'help'}
	});
	if (opts.help) displayHelp();

	api(opts).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
