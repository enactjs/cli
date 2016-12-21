var
	fs = require('fs-extra'),
	minimist = require('minimist');

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
	var opts = minimist(args, {
		boolean: ['h', 'help'],
		alias: {h:'help'}
	});
	opts.help && displayHelp();

	fs.remove('./build', function(bErr) {
		if(bErr) throw bErr;
		fs.remove('./dist', function(dErr) {
			if(dErr) throw dErr;
		});
	});
};
