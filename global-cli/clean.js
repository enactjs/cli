const
	fs = require('fs-extra'),
	minimist = require('minimist'),
	packageRoot = require('@enact/dev-utils/package-root');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact clean [options] [paths...]');
	console.log();
	console.log('  Arguments');
	console.log('    paths             Additional path(s) to delete');
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
	fs.removeSync('./build');
	fs.removeSync('./dist');
	opts._.forEach(d => {
		if(fs.existsSync(d)) {
			fs.removeSync(d);
		}
	})
};
