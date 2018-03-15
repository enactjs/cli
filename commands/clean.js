const chalk = require('chalk');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;

function displayHelp() {
	console.log('  Usage');
	console.log('    enact clean [options] [paths...]');
	console.log();
	console.log('  Arguments');
	console.log('    paths             Additional path(s) to delete');
	console.log();
	console.log('  Options');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function api({paths = []} = {}) {
	return Promise.all(paths.concat('./build', './dist').map(d => fs.remove(d)));
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['help'],
		alias: {h: 'help'}
	});
	opts.help && displayHelp();

	process.chdir(packageRoot().path);
	api({paths: opts._}).catch(err => {
		console.error(chalk.red('ERROR: ') + 'Failed to clean project.\n' + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
