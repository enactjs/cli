// @remove-file-on-eject
/* eslint no-console: off, no-undef: off */
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
const fs = require('fs-extra');
const prompts = require('prompts');
const minimist = require('minimist');
const {packageRoot} = require('@enact/dev-utils');
const spawn = require('cross-spawn');

let chalk;

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
	'semver',
	'tar',
	'validate-npm-package-name'
];
const enhanced = ['chalk', 'cross-spawn', 'filesize', 'fs-extra', 'minimist', 'strip-ansi'];
const content = ['@babel/runtime', 'core-js', 'react', 'react-dom'];
const bareDeps = {'cpy-cli': '^3.1.1', rimraf: '^3.0.2'};
const bareTasks = {
	serve: 'webpack-dev-server --hot --inline --env development --config config/webpack.config.js',
	pack: 'webpack --env development --config config/webpack.config.js && cpy public dist',
	'pack-p': 'webpack --env production --config config/webpack.config.js && cpy public dist',
	watch: 'cpy public dist && webpack --env development --config config/webpack.config.js --watch',
	clean: 'rimraf build dist',
	lint: 'eslint --no-config-lookup --config enact --ignore-pattern config/* .',
	license: 'license-checker ',
	test: 'jest --config config/jest/jest.config.js',
	'test-watch': 'jest --config config/jest/jest.config.js --watch'
};
// Vite variants of the barebones setup (used with `--vite`). Vite copies `public/`
// automatically (no `cpy` step) and loads the generated root `vite.config.mjs`.
// Reuse the same `rimraf` pin as the webpack bare setup so the version lives in one place.
const bareDepsVite = {rimraf: bareDeps.rimraf};
// esbuild-pack.js already copies public/ itself (like the non-bare path),
// so no cpy-cli is needed here either, same reasoning as bareDepsVite.
const bareDepsEsbuild = {rimraf: bareDeps.rimraf};
const bareTasksVite = {
	serve: 'vite',
	pack: 'vite build --mode development',
	'pack-p': 'vite build',
	watch: 'vite build --watch --mode development',
	clean: 'rimraf build dist',
	lint: bareTasks.lint,
	license: bareTasks.license,
	test: bareTasks.test,
	'test-watch': bareTasks['test-watch']
};
// Bundler-driven scripts that understand `--vite`; used to steer a non-bare Vite eject.
const VITE_CAPABLE_SCRIPTS = ['serve', 'pack'];
// esbuild variants of the barebones setup (used with `--esbuild`). Unlike
// webpack/Vite, esbuild's own CLI binary has no `--config <file>` mechanism
// that can load a JS module returning build options — all of the Babel/CSS
// Modules/ilib/HTML-generation/etc. transform logic in config/esbuild.config.js
// only runs via esbuild's *JS API*, called from commands/esbuild-*.js. So
// even a "bare" esbuild eject still drives serve/pack through
// scripts/{serve,pack}.js --esbuild rather than a raw `esbuild ...` CLI
// invocation — see the --bare/--esbuild handling in api() below, which keeps
// the scripts/ folder for this bundler choice specifically. The "bare"
// trimming still applies everywhere else (dependencies, ESLint, etc.).
const bareTasksEsbuild = {
	serve: 'node ./scripts/serve.js --esbuild',
	pack: 'node ./scripts/pack.js --esbuild',
	'pack-p': 'node ./scripts/pack.js --esbuild --production',
	watch: 'node ./scripts/pack.js --esbuild --watch',
	clean: 'rimraf build dist',
	lint: bareTasks.lint,
	license: bareTasks.license,
	test: bareTasks.test,
	'test-watch': bareTasks['test-watch']
};
// Bundler-driven scripts that understand `--esbuild`; used to steer a non-bare esbuild eject.
const ESBUILD_CAPABLE_SCRIPTS = ['serve', 'pack'];
// The Enact Vite config (config/vite.config.js) is a factory `(mode) => InlineConfig`,
// not the object/`{command, mode}` shape Vite's CLI expects. A bare Vite eject writes
// this thin root config to adapt it so `vite` / `vite build` work directly.
const VITE_ROOT_CONFIG =
	"import {createRequire} from 'module';\n" +
	"const require = createRequire(import.meta.url);\n" +
	'// config/vite.config.js exports `(mode) => InlineConfig`; Vite calls with {command, mode}.\n' +
	"const enactViteConfig = require('./config/vite.config.js');\n" +
	"export default ({mode}) => enactViteConfig(mode || 'production');\n";

// esbuild's internal ESLint invocation (config/esbuild.config.js) passes
// --config explicitly pre-eject; that gets stripped on eject (see the
// @remove-on-eject markers around it), so ESLint falls back to its own
// auto-discovery from the project root — which needs a real eslint.config.js
// (ESLint 9 flat config), not the legacy package.json#eslintConfig field
// configurePackage() writes. Reuse the copied config/eslintWebpackPluginConfig.js
// (already a valid flat-config module) via a thin root adapter.
const ESLINT_ROOT_CONFIG = "module.exports = require('./config/eslintWebpackPluginConfig');\n";

function displayHelp () {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact eject';

	console.log('  Usage');
	console.log(`    ${e} [options]`);
	console.log();
	console.log('  Options');
	console.log('    -b, --bare        Abandon Enact CLI command enhancements');
	console.log('                      and eject into a a barebones setup (using');
	console.log('                      webpack, eslint, karma, etc. directly)');
	console.log('    --vite            [Experimental] Use Vite instead of webpack:');
	console.log('                      alone, points the serve/pack scripts at the');
	console.log('                      Vite path; with --bare, emits a bare Vite setup');
	console.log('    --esbuild         [Experimental] Use esbuild instead of webpack:');
	console.log('                      alone, points the serve/pack scripts at the');
	console.log('                      esbuild path; with --bare, dependencies/ESLint');
	console.log('                      are still trimmed, but scripts/ is kept since');
	console.log('                      esbuild has no config-file-loading CLI of its own');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function validateEject () {
	return prompts({
		type: 'confirm',
		name: 'shouldEject',
		message: 'Are you sure you want to eject? This action is permanent.',
		default: false
	}).then(answer => {
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

function checkGitStatus () {
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

function verifyAbsent ({dest}) {
	if (fs.existsSync(dest)) {
		throw new Error(
			`"${dest}" already exists in your app folder. We cannot ` +
			'continue as you would lose all the changes in that file or directory. ' +
			'Please move or delete it (maybe make a copy for backup) and run this ' +
			'command again.'
		);
	}
}

function copySanitizedFile ({src, dest}) {
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

function configurePackage (bare, vite, esbuild) {
	const own = require('../package.json');
	const app = require(path.resolve('package.json'));
	const backup = JSON.stringify(app, null, 2) + os.EOL;
	const availScripts = fs.existsSync('./scripts') ? fs.readdirSync('./scripts').map(f => f.replace(/\.js$/, '')) : [];
	const enactCLI = new RegExp('enact (' + availScripts.join('|') + ')', 'g');
	// Select the webpack, Vite, or esbuild flavor of the barebones tasks/deps.
	// esbuild has no bare-specific dependency set of its own — every package
	// its pipeline needs (esbuild, @babel/core, postcss + plugins, less,
	// sass, ejs, resolve, graceful-fs, fast-glob, import-fresh, ...) is
	// already in `own.dependencies` and not in `internal`/`enhanced`, so the
	// generic merge loop below picks them all up correctly for both bare and
	// non-bare esbuild ejects without needing a separate list here.
	const tasks = esbuild ? bareTasksEsbuild : vite ? bareTasksVite : bareTasks;
	const deps = esbuild ? bareDepsEsbuild : vite ? bareDepsVite : bareDeps;
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
		Object.keys(deps).forEach(key => {
			console.log(`	Adding ${chalk.cyan(key)} to devDependencies`);
			app.devDependencies[key] = deps[key];
		});
	}

	console.log();

	// Update NPM task scripts
	const type = chalk.cyan('npm script');
	Object.keys(app.scripts).forEach(key => {
		if (bare && tasks[key]) {
			if (!conflicts.includes(type)) conflicts.push(type);
			const bin = tasks[key].match(/^(?:node\s+)*(\S*)/);
			const updated = (bin && bin[1]) || tasks[key];
			console.log(`	Updating npm task ${chalk.cyan(key)} to use ${chalk.cyan(updated)}`);
			app.scripts[key] = tasks[key];
		} else if (!bare) {
			app.scripts[key] = app.scripts[key].replace(enactCLI, (match, name) => {
				// In a non-bare Vite/esbuild eject, steer the bundler-driven scripts
				// down that path so `npm run serve`/`pack` use it instead of
				// webpack. Only the commands that understand the flag
				// (serve, pack) get it. esbuild and vite are mutually
				// exclusive (validated in api() before we ever get here).
				const bundlerFlag =
					esbuild && ESBUILD_CAPABLE_SCRIPTS.includes(name) ?
						' --esbuild' :
						vite && VITE_CAPABLE_SCRIPTS.includes(name) ?
							' --vite' :
							'';
				console.log(`	Updating npm task ${chalk.cyan(key)} to use ` + chalk.cyan(`scripts/${name}.js${bundlerFlag}`));
				return `node ./scripts/${name}.js${bundlerFlag}`;
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
	backupOld(['.eslintignore', 'eslint.config.js']);

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

function backupOld (files) {
	files.filter(fs.existsSync).forEach(f => {
		const backup = path.basename(f, path.extname(f)) + '.old' + path.extname(f);
		console.log(`	Found existing ${chalk.cyan(f)}; backing up to ${chalk.cyan(backup)}`);
		fs.renameSync(f, backup);
	});
}

function npmInstall () {
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

function api ({bare = false, vite = false, esbuild = false} = {}) {
	if (vite && esbuild) {
		return Promise.reject(new Error('--vite and --esbuild cannot be used together; choose one.'));
	}
	// Every other bare eject (webpack, Vite) can drop the scripts/ folder
	// because their real CLI binaries can load a JS config file directly.
	// esbuild's CLI has no equivalent — all of config/esbuild.config.js's
	// Babel/CSS Modules/ilib/HTML-generation logic only runs via esbuild's
	// JS API, called from commands/esbuild-*.js — so a bare esbuild eject
	// keeps scripts/ and drives serve/pack through it (see bareTasksEsbuild).
	if (bare && !esbuild) {
		assets.pop();
	}
	return validateEject().then(({abort = false, files = []}) => {
		if (!abort) {
			console.log('Ejecting...');
			console.log();
			console.log(chalk.cyan(`Copying files into ${process.cwd()}`));
			assets.forEach(dir => !fs.existsSync(dir.dest) && fs.mkdirSync(dir.dest, {recursive: true}));
			files.forEach(copySanitizedFile);
			// A bare Vite eject drives the Vite CLI directly, which loads a root
			// config; write the adapter that wires it to config/vite.config.js.
			if (bare && vite) {
				console.log(`	Adding ${chalk.cyan('vite.config.mjs')} to the project`);
				fs.writeFileSync('vite.config.mjs', VITE_ROOT_CONFIG, {encoding: 'utf8'});
			}
			if (bare && esbuild) {
				console.log(
					chalk.yellow(
						'NOTICE: esbuild has no config-file-loading CLI of its own, so scripts/ ' +
						'is kept even with --bare — serve/pack still run through ' +
						'scripts/{serve,pack}.js --esbuild. Dependencies and ESLint config are ' +
						'still trimmed as usual.'
					)
				);
			}
			console.log();
			console.log(chalk.cyan('Configuring package.json'));
			const con = configurePackage(bare, vite, esbuild);
			if (esbuild) {
				console.log(`	Adding ${chalk.cyan('eslint.config.js')} to the project`);
				fs.writeFileSync('eslint.config.js', ESLINT_ROOT_CONFIG, {encoding: 'utf8'});
			}
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

function cli (args) {
	const opts = minimist(args, {
		boolean: ['bare', 'vite', 'esbuild', 'help'],
		alias: {b: 'bare', h: 'help'}
	});
	if (opts.help) displayHelp();

	process.chdir(packageRoot().path);

	import('chalk').then(({default: _chalk}) => {
		chalk = _chalk;
		api({bare: opts.bare, vite: opts.vite, esbuild: opts.esbuild}).catch(err => {
			console.error(chalk.red('ERROR: ') + err.message);
			process.exit(1);
		});
	});
}

module.exports = {api, cli};