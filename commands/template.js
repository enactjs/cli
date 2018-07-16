// @remove-file-on-eject
const os = require('os');
const path = require('path');
const url = require('url');
const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const inquirer = require('react-dev-utils/inquirer');
const tar = require('tar');

const TEMPLATE_DIR = path.join(process.env.APPDATA || os.homedir(), '.enact');
const INCLUDED = path.dirname(require.resolve('@enact/template-moonstone'));
const DEFAULT_LINK = path.join(TEMPLATE_DIR, 'default');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact template <action> ...');
	console.log();
	console.log('  Actions');
	console.log('    enact template install [source] [name]');
	console.log(chalk.dim('    Install a template from a local or remote source'));
	console.log();
	console.log('        source            Git URI, npm package or local directory');
	console.log('                          (default: cwd)');
	console.log('        name              Specific name for the template');
	console.log();
	console.log('    enact template link [directory] [name]');
	console.log(chalk.dim('    Symlink a directory into template management'));
	console.log();
	console.log('        directory         Local directory path to link');
	console.log('                          (default: cwd)');
	console.log('        name              Specific name for the template');
	console.log();
	console.log('    enact template remove <name>');
	console.log(chalk.dim('    Remove a template by name'));
	console.log();
	console.log('        name              Name of template to remove');
	console.log();
	console.log('    enact template default [name]');
	console.log(chalk.dim('    Choose a default template for "enact create"'));
	console.log();
	console.log('        name              Specific template to set default');
	console.log();
	console.log('    enact template list');
	console.log(chalk.dim('    List all templates installed/linked'));
	console.log();
	console.log('  Options');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

function initTemplateArea() {
	if (!fs.existsSync(TEMPLATE_DIR)) {
		fs.mkdirSync(TEMPLATE_DIR);
	}
	const init = doLink(path.join(INCLUDED, 'template'), 'moonstone');
	const moonstoneLink = path.join(TEMPLATE_DIR, 'moonstone');
	return init.then(() => !fs.existsSync(DEFAULT_LINK) && doLink(moonstoneLink, 'default'));
}

function doInstall(target, name) {
	const github = target.match(/^([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})\/([-_.\w]+)((?:#|@)?[-_.\w]+)?$/);
	if (github) {
		// If target is GitHub shorthand, resolve to full HTTPS URI
		target = 'https://github.com/' + github[1] + '/' + github[2] + '.git' + (github[3] || '');
	}

	let installation;
	if (/(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|#[-\d\w._]+?)$/.test(target)) {
		installation = installFromGit(target, name);
	} else if (fs.existsSync(target)) {
		installation = installFromLocal(target, name);
	} else {
		installation = installFromNPM(target, name);
	}
	return installation.then(resolved => {
		// npm install if needed
		return new Promise((resolve, reject) => {
			const output = path.join(TEMPLATE_DIR, resolved);
			if (fs.existsSync(path.join(output, 'template')) && fs.existsSync(path.join(output, 'package.json'))) {
				const child = spawn('npm', ['--loglevel', 'error', 'install', '--production'], {
					stdio: 'inherit',
					cwd: output
				});
				child.on('close', code => {
					if (code !== 0) {
						reject(new Error('Failed to npm install dynamic template. Ensure package.json is valid.'));
					} else {
						resolve(resolved);
					}
				});
			} else {
				resolve(resolved);
			}
		});
	});
}

function normalizeName(name) {
	return name.replace(/(?:^enact-template-|^template-)/g, '');
}

// Clone Git repository using specific branch if desired
function installFromGit(target, name = normalizeName(path.basename(url.parse(target).pathname, '.git'))) {
	const git = target.match(/^(?:(^.*)#([\w\d-_.]+)?|(^.*))$/);
	const args = ['clone', git[1] || git[3], name, '-c', 'advice.detachedHead=false'];
	if (git[2]) args.splice(2, 0, '-b', git[2]);
	fs.removeSync(path.join(TEMPLATE_DIR, name));
	return new Promise((resolve, reject) => {
		const child = spawn('git', args, {stdio: 'inherit', cwd: TEMPLATE_DIR});
		child.on('close', code => {
			if (code !== 0) {
				reject(new Error(`Unable to clone git URI ${target}.`));
			} else {
				resolve(name);
			}
		});
	});
}

// Copy directory files
function installFromLocal(target, name = normalizeName(path.basename(target))) {
	const output = path.join(TEMPLATE_DIR, name);
	fs.removeSync(output);
	fs.ensureDirSync(output);
	return fs
		.copy(target, output)
		.then(() => name)
		.catch(err => {
			throw new Error(`Failed to copy template files from ${target}.\n${err.message}`);
		});
}

// Download and extract NPM package
function installFromNPM(target, name = normalizeName(path.basename(target).replace(/@.*$/g, ''))) {
	const tempDir = path.join(os.tmpdir(), 'enact');
	fs.removeSync(tempDir);
	fs.ensureDirSync(tempDir);
	return new Promise((resolve, reject) => {
		const child = spawn('npm', ['--loglevel', 'error', 'pack', target], {stdio: 'ignore', cwd: tempDir});
		child.on('close', code => {
			if (code !== 0) {
				reject(new Error('Invalid template target: ' + target));
			} else {
				const tarball = fs.readdirSync(tempDir).filter(f => f.endsWith('.tgz'))[0];
				if (tarball) {
					tar.x({file: path.join(tempDir, tarball), cwd: tempDir}, [], err => {
						if (err) {
							reject(new Error(`Tarball extraction failure.\n${err.message}`));
						} else {
							resolve();
						}
					});
				} else {
					reject(new Error(`Failed to download npm package ${target} from registry.`));
				}
			}
		});
	})
		.then(() => installFromLocal(path.join(tempDir, 'package'), name))
		.then(() => {
			fs.removeSync(tempDir);
			return name;
		});
}

function doLink(target, name = normalizeName(path.basename(path.resolve(target)))) {
	const directory = path.resolve(target);
	const prevCWD = process.cwd();
	process.chdir(TEMPLATE_DIR);
	return fs
		.remove(name)
		.then(() => fs.symlink(directory, name, 'junction'))
		.then(() => {
			process.chdir(prevCWD);
			return {target, name};
		})
		.catch(err => {
			process.chdir(prevCWD);
			throw new Error(`Unable to setup symlink to ${directory}.\n${err.message}`);
		});
}

function doRemove(name) {
	const output = path.join(TEMPLATE_DIR, name);
	const isDefault = fs.existsSync(DEFAULT_LINK) && fs.realpathSync(output) === fs.realpathSync(DEFAULT_LINK);
	if (!fs.existsSync(output)) return Promise.reject(new Error(`Unable to remove. Template "${name}" not found.`));

	return fs
		.remove(output)
		.then(() => isDefault && fs.removeSync(DEFAULT_LINK))
		.catch(err => {
			throw new Error(`Failed to delete template ${name}.\n${err.message}`);
		});
}

function doDefault(name) {
	const all = fs.readdirSync(TEMPLATE_DIR).filter(t => t !== 'default');
	let choice;
	if (name && all.includes(name)) {
		choice = Promise.resolve({template: name});
	} else {
		const i = all.find(t => fs.realpathSync(path.join(TEMPLATE_DIR, t)) === fs.realpathSync(DEFAULT_LINK));
		choice = inquirer.prompt([
			{
				name: 'template',
				type: 'list',
				choices: all,
				default: i,
				message: 'Which template would you like as the default?'
			}
		]);
	}
	return choice.then(response => doLink(path.join(TEMPLATE_DIR, response.template), 'default'));
}

function doList() {
	const realDefault = fs.realpathSync(DEFAULT_LINK);
	const all = fs.readdirSync(TEMPLATE_DIR).filter(t => t !== 'default');
	console.log(chalk.bold('Available Templates'));
	all.forEach(t => {
		let item = '  ' + t;
		const template = path.join(TEMPLATE_DIR, t);
		const realTemplate = fs.realpathSync(template);
		if (realTemplate === realDefault) {
			item += chalk.green(' (default)');
		}
		if (fs.lstatSync(template).isSymbolicLink()) {
			item += chalk.dim(' -> ' + realTemplate);
		}
		console.log(item);
	});
}

function api({action, target, name} = {}) {
	return initTemplateArea().then(() => {
		let actionPromise;

		if (['install', 'link', 'remove'].includes(action) && name === 'default')
			throw new Error('Template "default" name is reserved. ' + 'Use "enact template default" to modify it.');

		switch (action) {
			case 'install':
				actionPromise = doInstall(target, name).then(resolved => {
					console.log(`Template "${resolved}" installed.`);
				});
				break;
			case 'link':
				actionPromise = doLink(target, name).then(linked => {
					console.log(`Template "${linked.name}" linked from ${path.resolve(linked.target)}.`);
				});
				break;
			case 'remove':
				actionPromise = doRemove(name).then(() => {
					console.log(`Template "${name}" removed.`);
				});
				break;
			case 'default':
				actionPromise = doDefault(name).then(() => {
					console.log('Template successfully set as default.');
				});
				break;
			case 'list':
				doList();
				break;
			default:
				actionPromise = Promise.reject(new Error(`Invalid template action: ${action}.`));
				break;
		}
		return actionPromise;
	});
}

function cli(args) {
	const opts = minimist(args, {
		boolean: ['help'],
		alias: {h: 'help'}
	});
	if (opts.help) displayHelp();

	const action = opts._[0];
	const target = opts._[1] || process.cwd();
	const name = ['install', 'link'].includes(action) ? opts._[2] : opts._[1];
	if (!action) displayHelp();

	api({action, name, target}).catch(err => {
		console.error('Template action failed.');
		console.error();
		console.error(chalk.red('ERROR: ') + err.message);
		process.exit(1);
	});
}

module.exports = {api, cli};
