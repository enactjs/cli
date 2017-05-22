const
	fs = require('fs-extra'),
	minimist = require('minimist'),
	findProjectRoot = require('./modifiers/util/find-project-root');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact clean [options]');
	console.log();
	console.log('  Options');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

module.exports = function(args) {
	const opts = minimist(args, {
		boolean: ['h', 'help'],
		alias: {h:'help'}
	});
	opts.help && displayHelp();

	process.chdir(findProjectRoot().path);
	fs.remove('./build', bErr => {
		if(bErr) throw bErr;
		fs.remove('./dist', dErr => {
			if(dErr) throw dErr;
		});
	});
};
