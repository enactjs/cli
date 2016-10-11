var
	path = require('path'),
	glob = require('glob'),
	babel = require('babel-core'),
	fs = require('fs-extra'),
	minimist = require('minimist');

function displayHelp() {
	console.log('  Usage');
	console.log('    enact transpile [options]');
	console.log();
	console.log('  Options');
	console.log('    -o, --output      Directory to transpile to');
	console.log('    -v, --version     Display version information');
	console.log('    -h, --help        Display help information');
	console.log();
	process.exit(0);
}

module.exports = function(args) {
	var opts = minimist(args, {
		string: ['o', 'output'],
		boolean: ['h', 'help'],
		alias: {o:'output', h:'help'}
	});
	opts.help && displayHelp();

	var sourceRoot = '.';
	var buildRoot = opts.output || './build';

	console.log('Transpiling via Babel to ' + path.resolve(buildRoot));
	fs.copy(sourceRoot, buildRoot, {filter:/^(?!.*(node_modules|build|dist|\\.git)).*$/, stopOnErr:true}, function(cpErr) {
		if(cpErr) {
			console.error(cpErr);
		} else {
			glob(buildRoot + '/**/*.js', {nodir:true}, function(globErr, files) {
				if(globErr) {
					console.error(globErr);
				} else {
					var babelrc = path.join(__dirname, '..', 'config', '.babelrc');
					files.forEach(function(js) {
						babel.transformFile(js, {extends:babelrc}, function(babelErr, result) {
							if(babelErr) {
								console.error(babelErr);
							} else {
								fs.writeFile(js, result.code, {encoding:'utf8'}, function(fsErr) {
									if(fsErr) {
										console.error(fsErr);
									}
								});
							}
						});
					});
				}
			});
		}
	});
};
