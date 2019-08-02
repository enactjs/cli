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
	{src: path.join(__dirname, '..', 'config', 'jest'), dest: 'config/jest'},
	{src: path.join(__dirname, '..', 'commands'), dest: 'scripts'}
];
const internal = [
	'@babel/plugin-transform-modules-commonjs',
	'babel-plugin-transform-rename-import',
	'glob',
	'global-modules',
	'less-plugin-npm-import',
	'semver',
	'tar',
	'v8-compile-cache',
	'validate-npm-package-name'
];
const enhanced = ['chalk', 'cross-spawn', 'filesize', 'fs-extra', 'minimist', 'strip-ansi'];
const content = ['core-js', 'react', 'react-dom'];
const bareDeps = {'cpy-cli': '^2.0.0', rimraf: '^2.6.2'};
const bareTasks = {
	serve: 'webpack-dev-server --hot --inline --env development --config config/webpack.config.js',
	pack: 'webpack --env development --config config/webpack.config.js && cpy public dist',
	'pack-p': 'webpack --env production --config config/webpack.config.js && cpy public dist',
	watch: 'cpy public dist && webpack --env development --config config/webpack.config.js --watch',
	clean: 'rimraf build dist',
	lint: 'eslint --no-eslintrc --config enact --ignore-pattern config/* .',
	license: 'license-checker ',
	test: 'jest --config config/jest/jest.config.js',
	'test-watch': 'jest --config config/jest/jest.config.js --watch'
};

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact eject';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
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
	const own = require('../package.json');
	const app = require(path.resolve('package.json'));
	const backup = JSON.stringify(app, null, 2) + os.EOL;
	const availScripts = fs.readdirSync('./scripts').map(f => f.replace(/\.js$/, ''));
	const enactCLI = new RegExp('enact (' + availScripts.join('|') + ')', 'g');
	const eslintConfig = {extends: 'enact'};
	const eslintIgnore = ['build/*', 'config/*', 'dist/*', 'node_modules/*', 'scripts/*'];
	const conflicts = [];

	app.dependencies = app.dependencies || [];
	app.devDependencies = app.devDependencies || [];

	// Merge the applicable dependencies
	Object.keys(own.dependencies).forEach(key => {
		if (!internal.includes(key)) {
			if (content.includes(key)) {
				console.log(`	Adding ${chalk.cyan(key)} to dependencies`);
				app.dependencies[key] = app.dependencies[key] || own.dependencies[key];
			} else if (!enhanced.includes(key) || !bare) {
				console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
				app.devDependencies[key] = own.dependencies[key];
			}
		}
	});

	// Add any additional dependencies
	if (bare) {
		Object.keys(bareDeps).forEach(key => {
			console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
			app.devDependencies[key] = bareDeps[key];
		});
	}

	console.log();

	// Update NPM task scripts
	const type = chalk.cyan('npm script');
	Object.keys(app.scripts).forEach(key => {
		if (bare && bareTasks[key]) {
			if (!conflicts.includes(type)) conflicts.push(type);
			const bin = bareTasks[key].match(/^(?:node\s+)*(\S*)/);
			const updated = (bin && bin[1]) || bareTasks[key];
			console.log(`	Updating npm task ${chalk.cyan(key)} to use ${chalk.cyan(updated)}`);
			app.scripts[key] = bareTasks[key];
		} else if (!bare) {
			app.scripts[key] = app.scripts[key].replace(enactCLI, (match, name) => {
				console.log(`	Updating npm task ${chalk.cyan(key)} to use ` + chalk.cyan(`scripts/${name}.js`));
				return `node ./scripts/${name}.js`;
			});
		}
	});

	console.log();

	// Update ESLint settings
	console.log(`	Setting up ${chalk.cyan('ESlint')} config in package.json`);
	if (app.eslintConfig && JSON.stringify(app.eslintConfig) !== JSON.stringify(eslintConfig)) {
		conflicts.push(chalk.cyan('ESLint'));
	}
	app.eslintConfig = eslintConfig;
	app.eslintIgnore = app.eslintIgnore || [];
	app.eslintIgnore = app.eslintIgnore.concat(eslintIgnore.filter(l => !app.eslintIgnore.includes(l)));
	backupOld(['.eslintignore', '.eslintrc.js', '.eslintrc.yaml', '.eslintrc.yml', '.eslintrc.json', '.eslintrc']);

	// Sort the package.json output
	['dependencies', 'devDependencies'].forEach(obj => {
		const unsortedDependencies = app[obj];
		delete app[obj];
		app[obj] = {};
		Object.keys(unsortedDependencies)
			.sort()
			.forEach(key => {
				app[obj][key] = unsortedDependencies[key];
			});
	});

	fs.writeFileSync('package.json', JSON.stringify(app, null, 2) + os.EOL, {encoding: 'utf8'});

	if (conflicts.length > 0) fs.writeFileSync('package.old.json', backup, {encoding: 'utf8'});

	return conflicts;
}

function backupOld(files) {
	files.filter(fs.existsSync).forEach(f => {
		const backup = path.basename(f, path.extname(f)) + '.old' + path.extname(f);
		console.log(`	Found existing ${chalk.cyan(f)}; backing up to ${chalk.cyan(backup)}`);
		fs.renameSync(f, backup);
	});
}

function npmInstall() {
	return new Promise((resolve, reject) => {
		const proc = spawn('npm', ['--loglevel', 'error', 'install'], {stdio: 'inherit', cwd: process.cwd()});
		proc.on('close', code => {
			if (code !== 0) {
				reject(new Error('npm install failed.'));
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
			const con = configurePackage(bare);
			console.log();
			console.log(chalk.cyan('Running npm install...'));
			return npmInstall().then(() => {
				if (con.length > 0) {
					let list = con[0];
					if (con.length > 1) list = con.splice(1).join(', ') + ' and ' + list;
					console.log();
					console.log(
						chalk.yellow(
							`NOTICE: Existing ${list} settings within the package.json ` +
								'were overwritten. A backup of the original content has been ' +
								'preserved to package.old.json.'
						)
					);
				}
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
