var
	path = require('path'),
	fs = require('fs-extra'),
	minimist = require('minimist'),
	spawn = require('cross-spawn'),
	chalk = require('chalk'),
	semver = require('semver'),
	exists = require('path-exists').sync;

// @TODO: switch back to master when 0.2.0 releases
var ENACT_DEV_NPM = 'enyojs/enact-dev#develop';
	
function createApp(output, template, link, local, verbose) {
	var root = path.resolve(output);
	var appName = path.basename(root);

	checkNodeVersion();
	checkAppName(appName, template);

	if (!exists(root)) {
		fs.mkdirSync(root);
	} else if (!isSafeToCreateProjectIn(root)) {
		console.log('The directory "' + output + '" contains file(s) that could conflict. Aborting.');
		process.exit(1);
	}

	console.log('Creating a new Enact app in ' + root + '.');
	console.log();

	var prevCWD = process.cwd();
	process.chdir(root);
	copyTemplate(template, root);

	installDeps(root,link, local, verbose, function() {
		console.log();
		console.log('Success! Created ' + appName + ' at ' + root);
		console.log();
		console.log('Inside that directory, you can run several NPM commands, including:');
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
		//console.log(chalk.cyan('	npm run eject'));
		//console.log('		Removes this tool and copies build dependencies, configuration files');
		//console.log('		and scripts into the app directory. If you do this, you can’t go back!');
		//console.log();
		console.log('We suggest that you begin by typing:');
		if(prevCWD!=process.cwd()) {
			console.log(chalk.cyan('	cd'), output);
		}
		console.log('	' + chalk.cyan('npm run serve'));
		if(exists(path.join(root, 'README.old.md'))) {
			console.log();
			console.log(chalk.yellow('You had a `README.md` file, we renamed it to `README.old.md`'));
		}
		console.log();
		console.log('Have fun!');
	});
}

function copyTemplate(template, dest) {
	if(exists(path.join(dest, 'README.md'))) {
		fs.renameSync(path.join(dest, 'README.md'), path.join(dest, 'README.old.md'));
	}

	// Copy the files for the user
	fs.copySync(template, dest);

	// Rename gitignore after the fact to prevent npm from renaming it to .npmignore
	// See: https://github.com/npm/npm/issues/1862
	fs.move(path.join(dest, 'gitignore'), path.join(dest, '.gitignore'), [], function (err) {
		if (err) {
			// Append if there's already a `.gitignore` file there
			if (err.code === 'EEXIST') {
				var data = fs.readFileSync(path.join(dest, 'gitignore'));
				fs.appendFileSync(path.join(dest, '.gitignore'), data);
				fs.unlinkSync(path.join(dest, 'gitignore'));
			} else {
				throw err;
			}
		}
	});

	// Update package.json name
	var pkgJSON = path.join(dest, 'package.json');
	var meta = JSON.parse(fs.readFileSync(pkgJSON, {encoding:'utf8'}));
	meta.name = path.basename(dest);
	fs.writeFileSync(pkgJSON, JSON.stringify(meta, null, '\t'), {encoding:'utf8'});

	// Update appinfo.json if it exists in the template
	var appinfo = path.join(dest, 'appinfo.json');
	if(!exists(appinfo)) {
		appinfo = path.join(dest, 'webos-meta', 'appinfo.json');
		if(!exists(appinfo)) {
			appinfo = undefined;
		}
	}
	if(appinfo) {
		var aiMeta = JSON.parse(fs.readFileSync(appinfo, {encoding:'utf8'}));
		aiMeta.id = meta.name;
		fs.writeFileSync(appinfo, JSON.stringify(aiMeta, null, '\t'), {encoding:'utf8'});
	}
}

function installDeps(root, link, local, verbose, callback) {
	var args = [
		'--loglevel',
		(verbose ? 'verbose' : 'error'),
		'install',
		link && '--link'
	].filter(function(e) { return e; });

	console.log('Installing dependencies from npm...');

	var proc = spawn('npm', args, {stdio: 'inherit', cwd:root});
	proc.on('close', function(code) {
		if(code!==0) {
			console.log(chalk.cyan('ERROR: ') + '"npm ' + args.join(' ') + '" failed');
			process.exit(1);
		}
		if(local) {
			console.log('Installing enact-dev locally. This might take a couple minutes.');
			var devArgs = [
				'--loglevel',
				(verbose ? 'verbose' : 'error'),
				'install',
				link && '--link',
				ENACT_DEV_NPM,
				'--save-dev'
			].filter(function(e) { return e; });
			var devProc = spawn('npm', devArgs, {stdio: 'inherit', cwd:root});
			devProc.on('close', function(code) {
				if(code!==0) {
					console.log(chalk.cyan('ERROR: ') + '"npm ' + devArgs.join(' ') + '" failed');
					process.exit(1);
				}
				callback();
			});
		} else {
			callback();
		}
	});
}

function checkNodeVersion() {
	var localPath = path.resolve(process.cwd(), 'node_modules', 'enact-dev', 'package.json');
	var globalPath = path.join(__dirname, '..', 'package.json');
	var packageJson = fs.readJsonSync(globalPath, {throws:false}) || {};
	if(exists(localPath)) {
		packageJson = fs.readJsonSync(localPath, {throws:false}) || packageJson;
	}
	if (!packageJson.engines || !packageJson.engines.node) {
		return;
	}

	if (!semver.satisfies(process.version, packageJson.engines.node)) {
		console.error(
			chalk.red(
				'You are currently running Node %s but enact-dev requires %s.' +
				' Please use a supported version of Node.\n'
			),
			process.version,
			packageJson.engines.node
		);
		process.exit(1);
	}
}

function checkAppName(appName, template) {
	var templateMeta = fs.readJsonSync(path.join(template, 'package.json'), {throws: false}) || {};
	var dependencies = Object.keys(templateMeta.dependencies || {});
	var devDependencies = Object.keys(templateMeta.devDependencies || {});
	var allDependencies = dependencies.concat(devDependencies).sort();

	if (allDependencies.indexOf(appName) >= 0) {
		console.error(
			chalk.red(
				'We cannot create a project called `' + appName + '` because a dependency with the same name exists.\n' +
				'Due to the way npm works, the following names are not allowed:\n\n'
			) +
			chalk.cyan(
				allDependencies.map(function(depName) {
					return '	' + depName;
				}).join('\n')
			) +
			chalk.red('\n\nPlease choose a different project name.')
		);
		process.exit(1);
	}
}

// If project only contains files generated by GH, it’s safe.
function isSafeToCreateProjectIn(root) {
	var validFiles = [
		'.DS_Store', 'Thumbs.db', '.git', '.gitignore', '.idea', 'README.md', 'LICENSE'
	];
	return fs.readdirSync(root)
		.every(function(file) {
			return validFiles.indexOf(file) >= 0;
		});
}

function displayHelp() {
	console.log('  Usage');
	console.log('    enact init [options] [<directory>]');
	console.log();
	console.log('  Arguments');
	console.log('    directory         Optional project destination directory');
	console.log('                          (default: cwd)');
	console.log();
	console.log('  Options');
	console.log('    -link             Link in any applicable dependencies');
	console.log('    -local            Include enact-dev locally in the project');
	console.log('    -verbose          Verbose output logging');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

module.exports = function(args) {
	var opts = minimist(args, {
		boolean: ['link', 'local', 'verbose', 'h', 'help'],
		alias: {h:'help'}
	});
	opts.help && displayHelp();

	var template = path.join(__dirname, '..', 'template');
	var output = opts._[0] || process.cwd();
	createApp(output, template, opts.link, opts.local, opts.verbose);
};
