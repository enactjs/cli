const chalk = require('chalk');
const spawn = require('cross-spawn');
const fs = require('fs-extra');
const minimist = require('minimist');
const os = require('os');
const path = require('path');
const tar = require('tar');

const TEMPLATE_DIR = process.platform.includes('win')
	? path.join(process.env.APPDATA, 'enact-cli')
	: path.join(os.homedir(), '.enact');
const DEFAULT_LINK = path.join(TEMPLATE_DIR, 'default');
const GITHUB_SHORTHAND = /(^\w+\/\w+)(#\w+)?$/;
const GIT_URL = /(?:git|ssh|https?|git@[-\w.]+):(\/\/)?(.*?)(\.git)(\/?|#[-\d\w._]+?)$/;
const GIT_BRANCH = /^(?:(^.*)#(\w+)?|(^.*))$/

function displayHelp() {
	console.log('  Usage');
	console.log('    enact template <action> ...');
	console.log();
	console.log('  Actions');
	console.log('    enact template install <name> [source]');
	console.log(chalk.dim('    Install a template from a local or remote source'));
	console.log('    name              Name for the template to install as');
	console.log('    source            Git, NPM or local directory path');
	console.log('                          (default: cwd)');
	console.log();
	console.log('    enact template link <name> [directory]');
	console.log(chalk.dim('    Symlink a directory into template management'));
	console.log('    name              Name for the template');
	console.log('    directory         Local directory path to link');
	console.log('                          (default: cwd)');
	console.log();
	console.log('    enact template remove <name>');
	console.log(chalk.dim('    Remove a template by name'));
	console.log('    name              Name of template to remove');
	console.log();
	console.log('    enact template default <name>');
	console.log(chalk.dim('    Set a template as the default for "enact create"'));
	console.log('    name              Name of template to set default');
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

function validateArgs(action, name) {
	return new Promise((resolve, reject) => {
		if(!name && action!=='list') {
			reject(new Error('Invalid or missing template name.'))
		} else if(name === 'default') {
			reject(new Error('Template "default" name is reserved. '
					+ 'Use "enact template default <name>" to modify it.'));
		} else {
			resolve();
		}
	});
}

function initTemplateArea() {
	if(!fs.existsSync(TEMPLATE_DIR)) {
		fs.mkdirSync(TEMPLATE_DIR);
		console.log(path.join(__dirname, '..', 'template'))
	}
	const init = doLink('moonstone', path.join(__dirname, '..', 'template'));
	return init.then(() => !fs.existsSync(DEFAULT_LINK) && doDefault('moonstone'));
}

function doInstall(name, target) {
	const output = path.join(TEMPLATE_DIR, name);
	return doRemove(name).then(() => {
		const github = target.match(GITHUB_SHORTHAND);
		if(github) {
			// If target is GitHub shorthand, resolve to full HTTPS URI
			target = 'https://github.com/' + github[1] + '.git' + (github[2] || '');
		}

		if(GIT_URL.test(target)) {
			return installFromGit(name, target);
		} else if(fs.existsSync(target)) {
			return installFromLocal(output, target);
		} else {
			return installFromNPM(output, target);
		}
	}).then(() => {
		// npm install if needed
		return new Promise((resolve, reject) => {
			if(fs.existsSync(path.join(output, 'template'))
					&& fs.existsSync(path.join(output, 'package.json'))) {
				const child = spawn('npm', ['--loglevel', 'error', 'install'], {stdio: 'inherit', cwd:output});
				child.on('close', code => {
					if(code !== 0) {
						reject(new Error('Failed to NPM install dynamic template. Ensure package.json is valid.'));
					} else {
						resolve();
					}
				});
			} else {
				resolve();
			}
		});
	});
}

// Clone Git repository using specific branch if desired
function installFromGit(name, target) {
	return new Promise((resolve, reject) => {
		const git = target.match(GIT_BRANCH);
		const args = ['clone', (git[1] || git[3]), name];
		if(git[2]) args.splice(2, 0, '-b', git[2]);
		const child = spawn('git', args, {stdio:'inherit', cwd:TEMPLATE_DIR});
		child.on('close', code => {
			if(code !== 0) {
				reject(new Error(`Unable to clone git URI ${target}.`));
			} else {
				resolve();
			}
		});
	});
}

// Copy directory files
function installFromLocal(output, target) {
	return new Promise((resolve, reject) => {
		fs.ensureDirSync(output);
		fs.copy(target, output, err => {
			if(err) {
				reject(new Error(`Failed to copy template files from ${target}.\n${err.message}`));
			} else {
				resolve();
			}
		});
	});
}

// Download and extract NPM package
function installFromNPM(output, target) {
	return new Promise((resolve, reject) => {
		const tempDir = path.join(os.tmpdir(), 'enact');
		if(fs.existsSync(tempDir)) fs.removeSync(tempDir);
		fs.ensureDirSync(tempDir);

		const child = spawn('npm', ['--loglevel', 'error', 'pack', target], {stdio:'ignore', cwd:tempDir});
		child.on('close', code => {
			if(code !== 0) {
				reject(new Error('Invalid template target: ' + target));
			} else {
				const tarball = fs.readdirSync(tempDir).filter(f => f.endsWith('.tgz'))[0];
				if(tarball) {
					tar.x({file:path.join(tempDir, tarball), cwd:tempDir}, [], err => {
						if(err) {
							reject(new Error(`Tarball extraction failure.\n${err.message}`))
						} else {
							fs.ensureDirSync(output);
							fs.copy(path.join(tempDir, 'package'), output, err2 => {
								if(err2) {
									reject(new Error(`Failed to copy template files from ${tempDir}.\n${err2.message}`));
								} else {
									fs.removeSync(tempDir);
									resolve();
								}
							});
						}
					});
				} else {
					reject(new Error(`Failed to download NPM package ${target} from registry.`))
				}
			}
		});
	});
}

function doLink(name, target) {
	return doRemove(name).then(() => {
		return new Promise((resolve, reject) => {
			const directory = path.resolve(target);
			const prevCWD = process.cwd();
			process.chdir(TEMPLATE_DIR);
			fs.symlink(directory, name, 'junction', err => {
				process.chdir(prevCWD);
				if(err) {
					reject(new Error(`Unable to create symlink to ${target}.\n${err.message}`))
				} else {
					resolve();
				}
			});
		});
	});
}

function doRemove(name) {
	return new Promise((resolve, reject) => {
		const output = path.join(TEMPLATE_DIR, name);
		const realTemplate = fs.existsSync(output) && fs.realpathSync(output);
		const isDefault = fs.existsSync(DEFAULT_LINK) && realTemplate === fs.realpathSync(DEFAULT_LINK);
		if(realTemplate) {
			fs.remove(output, err => {
				if(err) {
					reject(new Error(`Failed to delete template ${name}.\n${err.message}`));
				} else {
					if(isDefault) {
						fs.removeSync(DEFAULT_LINK);
					}
					resolve();
				}
			});
		} else {
			resolve();
		}
	});
}

function doDefault(name) {
	const t = path.join(TEMPLATE_DIR, name);
	return new Promise((resolve, reject) => {
		if(fs.existsSync(t)) {
			resolve();
		} else {
			reject(new Error(`Template ${name} not found. Unable to set as default.`))
		}
	}).then(() => doLink('default', t));
}

function doList() {
	const realDefault = fs.realpathSync(DEFAULT_LINK);
	const all = fs.readdirSync(TEMPLATE_DIR);
	all.splice(all.indexOf('default'), 1);
	console.log(chalk.bold('Available Templates'))
	all.forEach(t => {
		let item = '  ' + t;
		const template = path.join(TEMPLATE_DIR, t);
		const realTemplate = fs.realpathSync(template);
		if(realTemplate === realDefault) {
			item += chalk.green(' (default)');
		}
		if(fs.lstatSync(template).isSymbolicLink()) {
			item += chalk.dim(' -> ' + realTemplate);
		}
		console.log(item);
	});
}


module.exports = function(args) {
	const opts = minimist(args, {
		boolean: ['h', 'help'],
		alias: {h:'help'}
	});
	opts.help && displayHelp();

	const action = opts._[0];
	const name = opts._[1];
	const target = opts._[2] || process.cwd();
	if(!action) displayHelp();

	validateArgs(action, name).then(() => initTemplateArea()).then(() => {
		let actionPromise;
		switch (action) {
			case 'install':
				actionPromise = doInstall(name, target).then(() => {
					console.log(`Template "${name}" installed.`);
				});
				break;
			case 'link':
				actionPromise = doLink(name, target).then(() => {
					console.log(`Template "${name}" linked from ${target}.`);
				})
				break;
			case 'remove':
				actionPromise = doRemove(name).then(() => {
					console.log(`Template "${name}" removed.`);
				});
				break;
			case 'default':
				actionPromise = doDefault(name).then(() => {
					console.log(`Template "${name}" set as default.`);
				});
				break;
			case 'list':
				doList();
				break;
			default:
				actionPromise = Promise.reject(`Invalid template action: ${action}.`)
				break;
		}
		return actionPromise;
	}).catch(err => console.log(chalk.red('ERROR: ') + err.message));
};
