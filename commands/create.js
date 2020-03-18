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
const os = require('os');
const path = require('path');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const validatePackageName = require('validate-npm-package-name');

const ENACT_DEV_NPM = '@enact/cli';
const CORE_JS_NPM = 'core-js@3';
const INCLUDED = path.dirname(require.resolve('@enact/template-moonstone'));
const TEMPLATE_DIR = path.join(process.env.APPDATA || os.homedir(), '.enact');

const defaultGenerator = {
	overwrite: false,
	install: true,
	type: 'app',
	validate: ({template, name}) => {
		const validation = validatePackageName(name);

		if (!validation.validForNewPackages) {
			throw new Error(
				`Cannot create a project called ${chalk.bold(name)} because of npm naming restrictions:\n` +
					validation.errors
						.concat(validation.warnings)
						.map(r => '  * ' + r)
						.join('/n')
			);
		} else {
			const meta = fs.readJsonSync(path.join(template, 'package.json'), {throws: false}) || {};
			const deps = Object.keys(meta.dependencies || {}).concat(Object.keys(meta.devDependencies || {}));
			deps.sort();

			if (deps.includes(name)) {
				throw new Error(
					'Cannot create a project called ' +
						chalk.bold(name) +
						' because a dependency with the same name exists.\n' +
						'Due to the way npm works, the following names are not allowed:\n\n' +
						chalk.cyan(deps.map(d => '\t' + d).join('\n')) +
						'\n\nPlease choose a different project name.'
				);
			}
		}
	},
	prepare: ({directory, name, type}) => {
		// After the workspace is ensured to exist, but before template is copied
		const validFiles = [
			// Generic project fragments and outside tool configs.
			'.DS_Store',
			'Thumbs.db',
			'.git',
			'.gitignore',
			'.idea',
			'README.md',
			'LICENSE',
			'web.iml',
			'.hg',
			'.hgignore',
			'.hgcheck',
			'.npmignore',
			'mkdocs.yml',
			'docs',
			'.travis.yml',
			'.gitlab-ci.yml',
			'.gitattributes',
			// Error fragments that can be ignored safely.
			'npm-debug.log',
			'npm-debug.log',
			'yarn-error.log',
			'yarn-debug.log'
		];
		const rel = path.relative(process.cwd(), directory);
		if (!rel || rel === '.') {
			console.log(`Creating a new Enact ${type}...`);
		} else {
			console.log(`Creating a new Enact ${type} in ${rel}...`);
		}

		console.log();

		if (!fs.readdirSync(directory).every(f => validFiles.includes(f))) {
			throw new Error(`The directory ${chalk.bold(name)} contains file(s) that could conflict. Aborting.`);
		}
	},
	setup: ({directory, name}) => {
		// Do stuff to setup the directory workspace after template is copied
		// Update package.json name
		const pkgJSON = path.join(directory, 'package.json');
		const meta = fs.readJsonSync(pkgJSON, {encoding: 'UTF8', throws: false}) || {};
		meta.name = name;
		fs.writeJsonSync(pkgJSON, meta, {encoding: 'UTF8', spaces: '\t'});

		// Update appinfo.json if it exists in the template
		let appinfo = path.join(directory, 'appinfo.json');
		if (!fs.existsSync(appinfo)) {
			appinfo = path.join(directory, 'webos-meta', 'appinfo.json');
			if (!fs.existsSync(appinfo)) {
				appinfo = undefined;
			}
		}
		if (appinfo) {
			const aiMeta = fs.readJsonSync(appinfo, {encoding: 'UTF8', throws: false}) || {};
			aiMeta.id = meta.name;
			fs.writeJsonSync(appinfo, aiMeta, {encoding: 'UTF8', spaces: '\t'});
		}
	},
	complete: ({directory, name}) => {
		// After everything is complete, output message to user
		console.log();
		console.log('Success! Created ' + name + ' at ' + directory);
		console.log();
		console.log('Inside that directory, you can run several npm commands, including:');
		console.log(chalk.cyan('	npm run serve'));
		console.log('		Starts the development server.');
		console.log(chalk.cyan('	npm run pack'));
		console.log('		Bundles the app into static files in development mode.');
		console.log(chalk.cyan('	npm run pack-p'));
		console.log('		Bundles the app into static files in production mode.');
		console.log(chalk.cyan('	npm run test'));
		console.log('		Starts the test runner.');
		console.log();
		// @TODO
		// console.log(chalk.cyan('	npm run eject'));
		// console.log('		Removes this tool and copies build dependencies, configuration files');
		// console.log('		and scripts into the app directory. If you do this, you can’t go back!');
		// console.log();
		console.log('We suggest that you begin by typing:');
		if (path.resolve(process.cwd()) !== path.resolve(directory)) {
			console.log(chalk.cyan('	cd ' + path.relative(process.cwd(), directory)));
		}
		console.log('	' + chalk.cyan('npm run serve'));
		console.log();
		console.log('Have fun!');
	}
};

function displayHelp() {
	let e = 'node ' + path.relative(process.cwd(), __filename);
	if (require.main !== module) e = 'enact create';

	console.log('  Usage');
	console.log(`    ${e} [options] [<directory>]`);
	console.log();
	console.log('  Arguments');
	console.log('    directory         Optional destination directory');
	console.log('                          (default: cwd)');
	console.log();
	console.log('  Options');
	console.log('    -t, --template    Specific template to use');
	console.log('    --local           Include @enact/cli locally');
	console.log('    --verbose         Verbose output logging');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function resolveTemplateGenerator(template) {
	return new Promise((resolve, reject) => {
		let templatePath = path.join(TEMPLATE_DIR, template);
		if (!fs.existsSync(templatePath)) {
			if (['default', 'moonstone'].includes(template)) {
				templatePath = path.join(INCLUDED, 'template');
			} else {
				reject(new Error(`Template ${chalk.bold(template)} not found.`));
			}
		}
		templatePath = fs.realpathSync(templatePath);
		const subDir = path.join(templatePath, 'template');
		if (fs.existsSync(subDir)) {
			try {
				const generator = require(templatePath) || {};
				Object.keys(defaultGenerator).forEach(k => {
					if (generator[k] === undefined) {
						generator[k] = defaultGenerator[k];
					}
				});
				resolve({generator, templatePath: subDir});
			} catch (e) {
				if (e.message === `Cannot find module '${templatePath}'`) {
					resolve({generator: defaultGenerator, templatePath: subDir});
				} else {
					reject(new Error(`Failed to load ${chalk.bold(template)} template generator.\n${e}`));
				}
			}
		} else {
			resolve({generator: defaultGenerator, templatePath});
		}
	});
}

function copyTemplate(template, output, overwrite) {
	const outputReadme = path.join(output, 'README.md');
	const outputGitIgnore = path.join(output, '.gitignore');
	let templateGitIgnore = fs.readdirSync(template).filter(f => ['.gitignore', 'gitignore'].includes(f))[0];
	templateGitIgnore = templateGitIgnore && path.join(template, templateGitIgnore);

	if (fs.existsSync(outputReadme) && fs.existsSync(path.join(template, 'README.md'))) {
		console.log(chalk.yellow('Found an existing README.md file. Renaming to README.old.md to avoid overwriting.'));
		console.log();
		fs.moveSync(outputReadme, path.join(output, 'README.old.md'));
	}

	// Copy the files for the user
	const filter = src => src !== templateGitIgnore;
	return fs
		.copy(template, output, {overwrite: overwrite, errorOnExist: !overwrite, filter: filter})
		.then(() => {
			// Handle gitignore after the fact to prevent npm from renaming it to .npmignore
			// See: https://github.com/npm/npm/issues/1862
			if (templateGitIgnore) {
				if (fs.existsSync(outputGitIgnore)) {
					// Append if there's already a `.gitignore` file there
					const data = fs.readFileSync(templateGitIgnore, {encoding: 'UTF8'});
					fs.appendFileSync(outputGitIgnore, data, {encoding: 'UTF8'});
				} else {
					fs.copySync(templateGitIgnore, outputGitIgnore);
				}
			}
		})
		.catch(err => {
			throw new Error(`Failed to copy template files to ${output}\n${err.stack}`);
		});
}

function npmInstall(directory, verbose, ...rest) {
	const args = ['--loglevel', verbose ? 'verbose' : 'error', 'install', ...rest];

	return new Promise((resolve, reject) => {
		const proc = spawn('npm', args, {stdio: 'inherit', cwd: directory});
		proc.on('close', code => {
			if (code !== 0) {
				reject(new Error('npm install failed.'));
			} else {
				resolve();
			}
		});
	});
}

function api(opts = {}) {
	return resolveTemplateGenerator(opts.template).then(({generator, templatePath}) => {
		const params = Object.assign({}, opts, {opts, defaultGenerator, type: generator.type});

		return new Promise(resolve => resolve(generator.validate && generator.validate(params)))
			.then(() => fs.ensureDir(opts.directory))
			.then(() => generator.prepare && generator.prepare(params))
			.then(() => copyTemplate(templatePath, opts.directory, generator.overwrite))
			.then(() => generator.setup && generator.setup(params))
			.then(() => generator.install && npmInstall(opts.directory, opts.verbose))
			.then(() => {
				if (opts.local) {
					console.log('Installing @enact/cli locally. This might take a couple minutes.');
					return npmInstall(opts.directory, opts.verbose, '--save', CORE_JS_NPM).then(() =>
						npmInstall(opts.directory, opts.verbose, '--save-dev', ENACT_DEV_NPM)
					);
				}
			})
			.then(() => generator.complete && generator.complete(params));
	});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['local', 'verbose', 'help'],
		string: ['template'],
		default: {template: 'default'},
		alias: {t: 'template', h: 'help'}
	});
	if (opts.help) displayHelp();

	opts.directory = path.resolve(typeof opts._[0] !== 'undefined' ? opts._[0] + '' : process.cwd());
	opts.name = path
		.basename(opts.directory)
		.replace(/ /g, '-')
		.toLowerCase();

	api(opts).catch(err => {
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
