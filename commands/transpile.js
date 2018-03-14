const path = require('path');
const babel = require('@babel/core');
const chalk = require('chalk');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils').packageRoot;

const babelrc = path.join(__dirname, '..', 'config', '.babelrc.js');
const plugins = [require.resolve('@babel/plugin-transform-modules-commonjs')];
const blacklist = ['node_modules', 'build', 'dist', '.git', '.gitignore'];

function displayHelp() {
	console.log('  Usage');
	console.log('    enact transpile [options]');
	console.log();
	console.log('  Options');
	console.log('    -i, --ignore      Pattern of filepaths to ignore');
	console.log('    -o, --output      Directory to transpile to');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function transpile(src, dest) {
	return new Promise((resolve, reject) => {
		babel.transformFile(src, {extends: babelrc, plugins}, (err, result) => {
			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});
	}).then(result => fs.writeFile(dest, result.code, {encoding: 'utf8'}));
}

function api({source = '.', output = './build', ignore} = {}) {
	process.env.ES5 = 'true';
	const filter = (src, dest) => {
		if (ignore && ignore.test && ignore.test(src)) {
			return false;
		} else if (path.extname(src) === '.js') {
			return fs.ensureDir(path.dirname(dest)).then(() => transpile(src, dest));
		} else {
			return true;
		}
	};

	return fs.readdir(source).then(paths => {
		paths = paths.filter(p => !blacklist.includes(p));
		return Promise.all(
			paths.map(item => {
				return fs.copy(path.join(source, item), path.join(output, item), {filter, stopOnErr: true});
			})
		);
	});
}

function cli(args) {
	const opts = minimist(args, {
		string: ['output', 'ignore'],
		boolean: ['help'],
		default: {output: './build'},
		alias: {i: 'ignore', o: 'output', h: 'help'}
	});
	opts.help && displayHelp();

	const ignore = opts.ignore ? new RegExp(opts.ignore) : false;
	process.chdir(packageRoot().path);
	console.log('Transpiling via Babel to ' + path.resolve(opts.output));

	api({source: '.', output: opts.output, ignore}).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
