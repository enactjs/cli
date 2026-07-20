// @remove-file-on-eject
/* eslint no-console: off, no-undef: off */
const path = require('path');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;
const doLink = require('./link').api;

let chalk;

function displayHelp () {
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
	/*
		Private Options:
			--override            Directory containing package .tgz archives to override dependencies.
	*/

	process.exit(0);
}

function npmExec (args, cwd = process.cwd(), loglevel) {
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

function newline () {
	console.log();
}

function api ({
	cwd = process.cwd(),
	base = true,
	sampler = true,
	allsamples = false,
	link = true,
	loglevel = 'error',
	override,
	verbose = false
} = {}) {
	const pkg = packageRoot(cwd);

	if (verbose) loglevel = 'verbose';

	return Promise.resolve()
		.then(() => {
			// Override dependencies in package.json, package-lock.json and npm-shrinkwrap.json
			if (override) {
				console.log('Overrides with local dependencies from', override);
				// Collect list of all valid local package tgz archives found
				const scoped = s => fs.readdirSync(path.join(override, s)).map(d => path.join(s, d));
				const local = fs
					.readdirSync(override)
					.reduce((a, curr) => a.concat(curr.startsWith('@') ? scoped(curr) : curr), [])
					.filter(d => fs.existsSync(path.join(override, d, 'package.tgz')));
				if (path.isAbsolute(override)) override = path.relative(cwd, override);
				['package.json', 'package-lock.json', 'npm-shrinkwrap.json']
					.map(f => path.join(cwd, f))
					.filter(f => fs.existsSync(f))
					.forEach(f => {
						const lockfile = path.basename(f) !== 'package.json';
						// Restore any detected backups
						if (fs.existsSync(f + '.bak')) {
							fs.unlinkSync(f);
							fs.renameSync(f + '.bak', f);
						}
						const obj = JSON.parse(fs.readFileSync(f, {encoding: 'utf8'}));
						if (lockfile) {
							obj.lockfileVersion = obj.lockfileVersion || 1;
							obj.requires = true;
						}
						// Update dependency entry for local entries that exist
						local.forEach(dep => {
							const fileDep = 'file:' + path.join(override, dep, 'package.tgz');
							if (!lockfile) {
								if (obj.dependencies && obj.dependencies[dep]) {
									obj.dependencies[dep] = fileDep;
								}
								return;
							}
							// lockfileVersion 1 (and the legacy tree kept in v2):
							// the flat "dependencies" map keyed by package name
							if (obj.dependencies && obj.dependencies[dep]) {
								obj.dependencies[dep].version = fileDep;
								// Remove unneeded properties to avoid issues
								['resolved', 'from', 'integrity', 'requires'].forEach(
									key => delete obj.dependencies[dep][key]
								);
							}
							// lockfileVersion 2 & 3: the "packages" map keyed by
							// install path (e.g. "node_modules/@enact/core")
							if (obj.packages) {
								// A dependency can be installed at the top level
								// ("node_modules/@enact/core") or nested
								// ("node_modules/@enact/limestone/node_modules/@enact/core"),
								// so update every path that resolves to this package.
								const suffix = 'node_modules/' + dep;
								Object.keys(obj.packages)
									.filter(key => key === suffix || key.endsWith('/' + suffix))
									.forEach(key => {
										obj.packages[key].version = fileDep;
										// Remove unneeded properties to avoid issues
										['resolved', 'from', 'integrity', 'requires'].forEach(
											k => delete obj.packages[key][k]
										);
									});
								// The root package ("") mirrors package.json's
								// dependency specifiers
								const root = obj.packages[''];
								if (root) {
									['dependencies', 'devDependencies', 'optionalDependencies'].forEach(
										depType => {
											if (root[depType] && root[depType][dep]) {
												root[depType][dep] = fileDep;
											}
										}
									);
								}
							}
						});
						// Backup existing and write the newly modified file
						fs.renameSync(f, f + '.bak');
						fs.writeFileSync(f, JSON.stringify(obj, null, '  '), {encoding: 'utf8'});
					});
			}
		})
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

function cli (args) {
	const opts = minimist(args, {
		boolean: ['base', 'sampler', 'allsamples', 'link', 'verbose', 'help'],
		string: ['loglevel', 'override'],
		default: {base: true, sampler: true, link: true},
		alias: {b: 'base', s: 'sampler', a: 'allsamples', l: 'link', h: 'help'}
	});
	if (opts.help) displayHelp();

	if (opts._[0] && fs.statSync(opts._[0]).isDirectory()) opts.cwd = opts._[0];

	import('chalk').then(({default: _chalk}) => {
		chalk = _chalk;
		api(opts).catch(err => {
			console.error(chalk.red('ERROR: ') + err.message);
			process.exit(1);
		});
	});
}

module.exports = {api, cli};
