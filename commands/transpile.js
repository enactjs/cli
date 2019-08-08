// @remove-file-on-eject
const path = require('path');
const babel = require('@babel/core');
const chalk = require('chalk');
const fs = require('fs-extra');
const less = require('less');
const LessPluginResolve = require('less-plugin-npm-import');
const minimist = require('minimist');
const LessPluginRi = require('resolution-independence');
const {optionParser: app} = require('@enact/dev-utils');

const blacklist = ['node_modules', 'build', 'dist', '.git', '.gitignore'];
const babelConfig = path.join(__dirname, '..', 'config', 'babel.config.js');
const babelRename = {original: '^(\\.(?!.*\\bstyles\\b.*).*)\\.less$', replacement: '$1.css'};

// Temporary until PLAT-72711, hardcode expected libraries to 24px base size
const ri24 = ['@enact/ui', '@enact/moonstone', '@enact/spotlight', '@enact/agate'];
const lessPlugins = [
	new LessPluginResolve({prefix: '~'}),
	new LessPluginRi(ri24.includes(app.name) ? {baseSize: 24} : app.ri)
];

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact transpile';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -i, --ignore      Pattern of filepaths to ignore');
	console.log('    -o, --output      Directory to transpile to');
	console.log('    -c, --commonjs    Whether to transform ES6 imports/exports');
	console.log('                      to CommonJS (defaults to true)');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function transpile(src, dest, plugins) {
	return new Promise((resolve, reject) => {
		babel.transformFile(src, {extends: babelConfig, plugins}, (err, result) => {
			if (err) {
				reject(err);
			} else {
				resolve(result);
			}
		});
	}).then(result => fs.writeFile(dest, result.code, {encoding: 'utf8'}));
}

function lessc(src, dest) {
	return less
		.render(fs.readFileSync(src, {encoding: 'utf8'}), {
			rewriteUrls: 'local',
			filename: src,
			paths: [],
			plugins: lessPlugins
		})
		.then(result => fs.writeFileSync(dest.replace(/\.less$/, '.css'), result.css, {encoding: 'utf8'}));
}

function api({source = '.', output = './build', commonjs = true, ignore} = {}) {
	process.env.ES5 = 'true';
	const babelPlugins = [
		commonjs && require.resolve('@babel/plugin-transform-modules-commonjs'),
		[require.resolve('babel-plugin-transform-rename-import'), babelRename]
	].filter(Boolean);

	const filter = (src, dest) => {
		if (ignore && ignore.test && ignore.test(src)) {
			return false;
		} else if (/\.(js|js|ts|tsx)$/i.test(src)) {
			return fs.ensureDir(path.dirname(dest)).then(() => transpile(src, dest, babelPlugins));
		} else if (/\.(less|css)$/i.test(src)) {
			// LESS/CSS within a 'styles' directory will not be run through LESS compiler
			if (/[\\/]+styles[\\/]+/i.test('./' + src)) {
				// Any LESS/CSS within an 'internal' directory will not be copied
				return !/[\\/]+styles[\\/]+(.*[\\/]+)*internal[\\/]+/i.test('./' + src);
			} else {
				return fs.ensureDir(path.dirname(dest)).then(() => lessc(src, dest));
			}
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
		boolean: ['commonjs', 'help'],
		default: {output: './build', commonjs: true},
		alias: {i: 'ignore', c: 'commonjs', o: 'output', h: 'help'}
	});
	if (opts.help) displayHelp();

	const ignore = opts.ignore ? new RegExp(opts.ignore) : false;
	process.chdir(app.context);
	console.log('Transpiling via Babel to ' + path.resolve(opts.output));

	api({source: '.', output: opts.output, commonjs: opts.commonjs, ignore}).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
	});
}

module.exports = {api, cli};
