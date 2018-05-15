// @remove-file-on-eject
/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 * https://github.com/facebook/create-react-app
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
const cp = require('child_process');
const os = require('os');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs-extra');
const inquirer = require('react-dev-utils/inquirer');
const minimist = require('minimist');
const {packageRoot} = require('@enact/dev-utils');
const spawn = require('cross-spawn');

const assets = [
	{src: path.join(__dirname, '..', 'config'), dest: 'config'},
	{src: path.join(__dirname, '..', 'commands'), dest: 'scripts'}
];
const internal = [
	'@babel/plugin-transform-modules-commonjs',
	'glob',
	'global-modules',
	'semver',
	'tar',
	'v8-compile-cache',
	'validate-npm-package-name'
];
const enhanced = ['chalk', 'cross-spawn', 'filesize', 'fs-extra', 'minimist', 'strip-ansi'];
const content = ['@babel/polyfill'];
const bareDeps = {rimraf: '^2.6.2'};
const bareTasks = {
	serve: 'webpack-dev-server --hot --inline --config config/webpack.config.dev.js',
	pack: 'webpack --config config/webpack.config.dev.js',
	'pack-p': 'webpack --config config/webpack.config.prod.js',
	watch: 'webpack --config config/webpack.config.dev.js --watch',
	clean: 'rimraf build dist',
	lint: 'eslint --no-eslintrc --config enact --ignore-pattern config/* .',
	license: 'license-checker ',
	test: 'karma test start config/karma.conf.js --single-run',
	'test-watch': 'karma test start config/karma.conf.js'
};

function displayHelp() {
	console.log('  Usage');
	console.log('    enact eject [options]');
	console.log();
	console.log('  Options');
	console.log('    -b, --bare        Abandon Enact CLI command enhancements');
	console.log('                      and eject into a a barebones setup (using');
	console.log('                      webpack, eslint, karma, etc. directly)');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function validateEject() {
	return inquirer
		.prompt({
			type: 'confirm',
			name: 'shouldEject',
			message: 'Are you sure you want to eject? This action is permanent.',
			default: false
		})
		.then(answer => {
			if (!answer.shouldEject) {
				console.log(chalk.cyan('Close one! Eject aborted.'));
				return {abort: true};
			} else {
				checkGitStatus();

				// Make shallow array of files paths
				const files = assets.reduce((list, dir) => {
					return list.concat(
						fs
							.readdirSync(dir.src)
							// set full relative path
							.map(file => ({
								src: path.join(dir.src, file),
								dest: path.join(dir.dest, file)
							}))
							// omit dirs from file list
							.filter(file => fs.lstatSync(file.src).isFile())
					);
				}, []);
				files.forEach(verifyAbsent);
				return {files};
			}
		});
}

function checkGitStatus() {
	let status;
	try {
		const stdout = cp.execSync(`git status --porcelain`, {stdio: ['pipe', 'pipe', 'ignore']});
		status = stdout.toString().trim();
	} catch (e) {
		status = '';
	}
	if (status) {
		throw new Error(
			chalk.red('This git repository has untracked files or uncommitted changes:') +
				'\n\n' +
				status
					.split('\n')
					.map(line => line.match(/ .*/g)[0].trim())
					.join('\n') +
				'\n\n' +
				chalk.red('Remove untracked files, stash or commit any changes, and try again.')
		);
	}
}

function verifyAbsent({dest}) {
	if (fs.existsSync(dest)) {
		throw new Error(
			`"${dest}" already exists in your app folder. We cannot ` +
				'continue as you would lose all the changes in that file or directory. ' +
				'Please move or delete it (maybe make a copy for backup) and run this ' +
				'command again.'
		);
	}
}

function copySanitizedFile({src, dest}) {
	let data = fs.readFileSync(src, {encoding: 'utf8'});

	// Skip flagged files
	if (data.match(/\/\/ @remove-file-on-eject/)) {
		return false;
	}

	data =
		data
			// Remove dead code from .js files on eject
			.replace(/[\t ]*\/\/ @remove-on-eject-begin([\s\S]*?)\/\/ @remove-on-eject-end\n?/gm, '')
			// Remove dead code from .applescript files on eject
			.replace(/[\t ]*-- @remove-on-eject-begin([\s\S]*?)-- @remove-on-eject-end\n?/gm, '')
			.trim() + '\n';

	console.log(`	Adding ${chalk.cyan(dest)} to the project`);
	fs.writeFileSync(dest, data, {encoding: 'utf8'});
}

function configurePackage(bare) {
	const ownMeta = require('../package.json');
	const appMeta = require(path.resolve('package.json'));

	// Update ESLint settings
	console.log(`	Adding ${chalk.cyan('ESlint')} config to package.json`);
	appMeta.eslintConfig = {extends: 'enact'};
	appMeta.eslintIgnore = ['config/*', 'scripts/*', 'node_modules/*', 'build/*', 'dist/*'];

	// Update Babel settings
	console.log(`	Adding ${chalk.cyan('Babel')} config to package.json`);
	appMeta.babel = {extends: './config/.babelrc.js'};

	console.log();

	appMeta.dependencies = appMeta.dependencies || [];
	appMeta.devDependencies = appMeta.devDependencies || [];

	// Merge the applicable dependencies
	Object.keys(ownMeta.dependencies).forEach(key => {
		if (!internal.includes(key)) {
			if (content.includes(key)) {
				console.log(`	Adding ${chalk.cyan(key)} to dependencies`);
				appMeta.dependencies[key] = ownMeta.dependencies[key];
			} else if (!enhanced.includes(key) || !bare) {
				console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
				appMeta.devDependencies[key] = ownMeta.dependencies[key];
			}
		}
	});

	// Add any additional dependencies
	if (bare) {
		Object.keys(bareDeps).forEach(key => {
			console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
			appMeta.devDependencies[key] = bareDeps[key];
		});
	}

	// Sort the dependencies
	['dependencies', 'devDependencies'].forEach(obj => {
		const unsortedDependencies = appMeta[obj];
		delete appMeta[obj];
		appMeta[obj] = {};
		Object.keys(unsortedDependencies)
			.sort()
			.forEach(key => {
				appMeta[obj][key] = unsortedDependencies[key];
			});
	});

	console.log();

	// Update NPM task scripts
	Object.keys(bareTasks).forEach(key => {
		const task = bare ? bareTasks[key] : `node ./scripts/${key}.js`.replace(/-(.*)\.js/, '.js -$1');
		const bin = task.match(/^(?:node\s+)*(\S*)/);
		const updated = (bin && bin[1]) || task;
		console.log(`	Updated NPM task ${chalk.cyan(key)} to use ${chalk.cyan(updated)}`);
		appMeta.scripts[key] = task;
	});

	fs.writeFileSync('package.json', JSON.stringify(appMeta, null, 2) + os.EOL, {encoding: 'utf8'});
}

function npmInstall() {
	return new Promise((resolve, reject) => {
		const proc = spawn('npm', ['--loglevel', 'error', 'install'], {stdio: 'inherit', cwd: process.cwd()});
		proc.on('close', code => {
			if (code !== 0) {
				reject(new Error('NPM install failed.'));
			} else {
				resolve();
			}
		});
	});
}

function api({bare = false} = {}) {
	if (bare) {
		assets.pop();
	}
	return validateEject().then(({abort = false, files = []}) => {
		if (!abort) {
			console.log('Ejecting...');
			console.log();
			console.log(chalk.cyan(`Copying files into ${process.cwd()}`));
			assets.forEach(dir => !fs.existsSync(dir.dest) && fs.mkdirSync(dir.dest));
			files.forEach(copySanitizedFile);
			console.log();
			console.log(chalk.cyan('Configuring package.json'));
			configurePackage(bare);
			console.log();
			console.log(chalk.cyan('Running npm install...'));
			return npmInstall().then(() => {
				console.log();
				console.log(chalk.green('Ejected successfully!'));
				console.log();
			});
		}
	});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['bare', 'help'],
		alias: {b: 'bare', h: 'help'}
	});
	if (opts.help) displayHelp();

	process.chdir(packageRoot().path);

	api({bare: opts.bare}).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
