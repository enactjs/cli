/* eslint-env node, es6 */
const path = require('path');
const {existsSync, readdirSync} = require('node:fs');
const {rm} = require('node:fs/promises');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;

let picocolors;

const build = 'build';
const dist = 'dist';
const node_modules = 'node_modules';
const samples = 'samples';
const ssTests = path.join('tests', 'screenshot');
const uiTests = path.join('tests', 'ui');

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact clean';

	console.log('  Usage');
	console.log(`    ${e} [options] [paths...]`);
	console.log();
	console.log('  Arguments');
	console.log('    paths             Additional path(s) to delete');
	console.log();
	console.log('  Options');
	console.log('    -a, --all         Clean all temporary files');
	console.log('                      (includes node_modules)');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function api({paths = [], all = false} = {}) {
	const known = [build, dist];
	if (all) known.push(node_modules);
	if (existsSync(samples)) {
		const sampleDirs = readdirSync(samples)
			.map(p => path.join(samples, p))
			.filter(p => existsSync(path.join(p, 'package.json')));
		sampleDirs.forEach(p => {
			known.push(path.join(p, build), path.join(p, dist));
			if (all) known.push(path.join(p, node_modules));
		});
	}
	if (existsSync(ssTests)) known.push(path.join(ssTests, dist));
	if (existsSync(uiTests)) known.push(path.join(uiTests, dist));
	return Promise.all(paths.concat(known).map(d => rm(d, {recursive: true, force: true})));
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['help', 'all'],
		alias: {h: 'help', a: 'all'}
	});
	if (opts.help) displayHelp();

	process.chdir(packageRoot().path);
	import('picocolors').then(({default: _picocolors}) => {
		picocolors = _picocolors;
		api({paths: opts._, all: opts.all}).catch(err => {
			console.error(picocolors.red('ERROR: ') + 'Failed to clean project.\n' + err.message);
			process.exit(1);
		});
	});
}

module.exports = {api, cli};
if (require.main === module) cli(process.argv.slice(2));
