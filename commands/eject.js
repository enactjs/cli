/**
 * Portions of this source code file are from create-react-app, used under the
 * following MIT license:
 *
 * Copyright (c) 2013-present, Facebook, Inc.
 * https://github.com/facebookincubator/create-react-app
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
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

const ownPath = path.join(__dirname, '..');
const assets = ['config'];
const internalDeps = [
	'@babel/plugin-transform-modules-commonjs',
	'chalk',
	'cross-spawn',
	'filesize',
	'fs-extra',
	'glob',
	'global-modules',
	'minimist',
	'semver',
	'strip-ansi',
	'tar',
	'v8-compile-cache',
	'validate-npm-package-name'
];
const contentDeps = ['@babel/polyfill'];
const extraDeps = {rimraf: '^2.6.2'};
const taskMap = {
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
const taskBin = /^(?:node\s+)*(\S*)/;

function displayHelp() {
	console.log('  Usage');
	console.log('    enact eject [options]');
	console.log();
	console.log('  Options');
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
							.readdirSync(path.join(ownPath, dir))
							// set full relative path
							.map(file => path.join(dir, file))
							// omit dirs from file list
							.filter(file => fs.lstatSync(path.join(ownPath, file)).isFile())
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

function verifyAbsent(file) {
	if (fs.existsSync(file)) {
		throw new Error(
			`"${file}" already exists in your app folder. We cannot ` +
				'continue as you would lose all the changes in that file or directory. ' +
				'Please move or delete it (maybe make a copy for backup) and run this ' +
				'command again.'
		);
	}
}

function copySanitizedFile(file) {
	let content = fs.readFileSync(path.join(ownPath, file), {encoding: 'utf8'});

	// Skip flagged files
	if (content.match(/\/\/ @remove-file-on-eject/)) {
		return false;
	}

	content =
		content
			// Remove dead code from .js files on eject
			.replace(/\/\/ @remove-on-eject-begin([\s\S]*?)\/\/ @remove-on-eject-end/gm, '')
			// Remove dead code from .applescript files on eject
			.replace(/-- @remove-on-eject-begin([\s\S]*?)-- @remove-on-eject-end/gm, '')
			.trim() + '\n';

	console.log(`	Adding ${chalk.cyan(file)} to the project`);
	fs.writeFileSync(file, content, {encoding: 'utf8'});
}

function configurePackage() {
	const ownMeta = require('../package.json');
	const appMeta = require(path.resolve('package.json'));

	appMeta.dependencies = appMeta.dependencies || [];
	appMeta.devDependencies = appMeta.devDependencies || [];

	// Merge the applicable dependencies
	Object.keys(ownMeta.dependencies).forEach(key => {
		if (!internalDeps.includes(key)) {
			if (contentDeps.includes(key)) {
				console.log(`	Adding ${chalk.cyan(key)} to dependencies`);
				appMeta.dependencies[key] = ownMeta.dependencies[key];
			} else {
				console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
				appMeta.devDependencies[key] = ownMeta.dependencies[key];
			}
		}
	});

	// Add any additional dependencies
	Object.keys(extraDeps).forEach(key => {
		console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
		appMeta.devDependencies[key] = extraDeps[key];
	});

	// Sort the dependencies
	['dependencies', 'devDependencies'].forEach(obj => {
		const unsortedDependencies = appMeta[obj];
		appMeta[obj] = {};
		Object.keys(unsortedDependencies)
			.sort()
			.forEach(key => {
				appMeta[obj][key] = unsortedDependencies[key];
			});
	});

	console.log();

	Object.keys(taskMap).forEach(key => {
		const bin = taskMap[key].match(taskBin);
		const updated = (bin && bin[1]) || taskMap[key];
		console.log(`	Updated NPM task ${chalk.cyan(key)} to use ${chalk.cyan(updated)}`);
		appMeta.scripts[key] = taskMap[key];
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

function api() {
	return validateEject().then(({abort = false, files = []}) => {
		if (!abort) {
			console.log('Ejecting...');
			console.log();
			console.log(chalk.cyan(`Copying files into ${process.cwd()}`));
			assets.forEach(dir => !fs.existsSync(dir) && fs.mkdirSync(dir));
			files.forEach(copySanitizedFile);
			console.log();
			console.log(chalk.cyan('Configuring package.json'));
			configurePackage();
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
		boolean: ['help'],
		alias: {h: 'help'}
	});
	opts.help && displayHelp();

	process.chdir(packageRoot().path);

	api().catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
