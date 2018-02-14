const path = require('path');
const glob = require('glob');
const babel = require('babel-core');
const chalk = require('chalk');
const fs = require('fs-extra');
const minimist = require('minimist');
const packageRoot = require('@enact/dev-utils/package-root');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact transpile [options]');
	console.log();
	console.log('  Options');
	console.log('    -o, --output      Directory to transpile to');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function api({source = '.', output = './build'} = {}) {
	process.env.ES5 = 'true';
	const filter = f => /^(?!.*(node_modules|build|dist|\\.git)).*$/.test(f);
	return fs.copy(source, output, {filter, stopOnErr:true}).then(() => {
		return new Promise((resolve, reject) => {
			glob(output + '/**/*.js', {nodir:true}, (err, files) => {
				if(err) {
					reject(err);
				} else {
					resolve(files || []);
				}
			});
		}).then(files => {
			const babelrc = path.join(__dirname, '..', 'config', '.babelrc');
			const plugins = [require.resolve('babel-plugin-transform-es2015-modules-commonjs')];
			return Promise.all(files.map(js => {
				return new Promise((resolve, reject) => {
					babel.transformFile(js, {extends:babelrc, plugins}, (err, transpiled) => {
						if(err) {
							reject(err);
						} else {
							resolve(transpiled || {})
						}
					});
				}).then(transpiled => fs.writeFile(js, transpiled.code, {encoding:'utf8'}));
			}));
		});
	});
}

function cli(args) {
	const opts = minimist(args, {
		string: ['output'],
		boolean: ['help'],
		default: {output:'./build'},
		alias: {o:'output', h:'help'}
	});
	opts.help && displayHelp();

	process.chdir(packageRoot().path);
	console.log('Transpiling via Babel to ' + path.resolve(opts.output));

	api({source:'.', output:opts.output}).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
