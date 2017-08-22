const
	spawn = require('cross-spawn'),
	path = require('path'),
	dir = require('global-modules'),
	chalk = require('chalk'),
	exists = require('path-exists').sync,
	minimist = require('minimist');

const enact = [
	'core',
	'ui',
	'moonstone',
	'spotlight',
	'i18n',
	'webos'
];

function displayHelp() {
	console.log('  Usage');
	console.log('    enact link [options]');
	console.log();
	console.log('  Options');
	console.log('    -verbose          Verbose output logging');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

module.exports = function(args) {
	const opts = minimist(args, {
		boolean: ['verbose', 'h', 'help'],
		alias: {h:'help'}
	});
	opts.help && displayHelp();

	const linkArgs = [
		'--loglevel',
		(opts.verbose ? 'verbose' : 'error'),
		'link'
	];

	const missing = [];
	for(let i=0; i<enact.length; i++) {
		if(exists(path.join(dir, '@enact', enact[i]))) {
			linkArgs.push('@enact/' + enact[i]);
		} else {
			missing.push('@enact/' + enact[i]);
		}
	}

	if(missing.length === enact.length) {
		console.log(chalk.red('Unable to detect any Enact global modules. Please ensure they\'ve been correctly linked.'));
		process.exit(1);
	} else {
		for(let j=0; j<missing.length; j++) {
			console.log(chalk.yellow('Unable to locate global module ' + missing[j] + '. Skipping...'));
		}

		const proc = spawn('npm', linkArgs, {stdio: 'inherit', cwd:process.cwd()});
		proc.on('close', code => {
			if(code!==0) {
				console.log(chalk.cyan('ERROR: ') + '"npm ' + linkArgs.join(' ') + '" failed');
				process.exit(1);
			}
		});
	}
};
