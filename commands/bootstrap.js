// @remove-file-on-eject
const path = require('path');
const {existsSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync} = require('node:fs');
const spawn = require('cross-spawn');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;
const doLink = require('./link').api;

let picocolors;

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
	/*
		Private Options:
			--override            Directory containing package .tgz archives to override dependencies.
	*/

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
				const scoped = s => readdirSync(path.join(override, s)).map(d => path.join(s, d));
				const local = readdirSync(override)
					.reduce((a, curr) => a.concat(curr.startsWith('@') ? scoped(curr) : curr), [])
					.filter(d => existsSync(path.join(override, d, 'package.tgz')));
				if (path.isAbsolute(override)) override = path.relative(cwd, override);
				['package.json', 'package-lock.json', 'npm-shrinkwrap.json']
					.map(f => path.join(cwd, f))
					.filter(f => existsSync(f))
					.forEach((f, i) => {
						const lockfile = i > 0;
						// Restore any detected backups
						if (existsSync(f + '.bak')) {
							unlinkSync(f);
							renameSync(f + '.bak', f);
						}
						const obj = JSON.parse(readFileSync(f, {encoding: 'utf8'}));
						// Update dependency entry for local entries that exist
						local
							.filter(dep => obj.dependencies && obj.dependencies[dep])
							.forEach(dep => {
								const fileDep = 'file:' + path.join(override, dep, 'package.tgz');
								if (lockfile) {
									obj.lockfileVersion = obj.lockfileVersion || 1;
									obj.requires = true;
									obj.dependencies[dep].version = fileDep;
									// Remove unneeded properties to avoid issues
									['resolved', 'from', 'integrity', 'requires'].forEach(
										key => delete obj.dependencies[dep][key]
									);
								} else {
									obj.dependencies[dep] = fileDep;
								}
							});
						// Backup existing and write the newly modified file
						renameSync(f, f + '.bak');
						writeFileSync(f, JSON.stringify(obj, null, '  '), {encoding: 'utf8'});
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
				if (existsSync(samples)) {
					return readdirSync(samples)
						.filter(p => (p === 'sampler' && sampler) || allsamples)
						.map(p => path.join(samples, p))
						.filter(p => existsSync(path.join(p, 'package.json')))
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
		string: ['loglevel', 'override'],
		default: {base: true, sampler: true, link: true},
		alias: {b: 'base', s: 'sampler', a: 'allsamples', l: 'link', h: 'help'}
	});
	if (opts.help) displayHelp();

	if (opts._[0] && statSync(opts._[0]).isDirectory()) opts.cwd = opts._[0];

	import('picocolors').then(({default: _picocolors}) => {
		picocolors = _picocolors;
		api(opts).catch(err => {
			console.error(picocolors.red('ERROR: ') + err.message);
			process.exit(1);
		});
	});
}

module.exports = {api, cli};
