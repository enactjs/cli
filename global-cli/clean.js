const
	fs = require('fs-extra'),
	minimist = require('minimist'),
	packageRoot = require('@enact/dev-utils/package-root');

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

	process.chdir(packageRoot().path);
	fs.remove('./build', bErr => {
		if(bErr) throw bErr;
		fs.remove('./dist', dErr => {
			if(dErr) throw dErr;
			fs.remove('./bin', binErr => {
				if(binErr) throw binErr;
			});
		});
	});
};
