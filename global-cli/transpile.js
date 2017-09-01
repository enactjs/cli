const
	path = require('path'),
	glob = require('glob'),
	babel = require('babel-core'),
	fs = require('fs-extra'),
	minimist = require('minimist'),
	findProjectRoot = require('./modifiers/util/find-project-root');

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
	const opts = minimist(args, {
		string: ['o', 'output'],
		boolean: ['h', 'help'],
		alias: {o:'output', h:'help'}
	});
	opts.help && displayHelp();

	process.chdir(findProjectRoot().path);

	const sourceRoot = '.';
	const buildRoot = opts.output || './build';

	console.log('Transpiling via Babel to ' + path.resolve(buildRoot));
	fs.copy(sourceRoot, buildRoot, {filter:function(f) { return /^(?!.*(node_modules|build|dist|\\.git)).*$/.test(f); }, stopOnErr:true}, cpErr => {
		if(cpErr) {
			console.error(cpErr);
		} else {
			glob(buildRoot + '/**/*.js', {nodir:true}, (globErr, files) => {
				if(globErr) {
					console.error(globErr);
				} else {
					const babelrc = path.join(__dirname, '..', 'config', '.babelrc');
					files.forEach(js => {
						babel.transformFile(js, {extends:babelrc, plugins:[require.resolve('babel-plugin-transform-es2015-modules-commonjs')]}, (babelErr, result) => {
							if(babelErr) {
								console.error(babelErr);
							} else {
								fs.writeFile(js, result.code, {encoding:'utf8'}, fsErr => {
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
