var
	path = require('path'),
	ncp = require('ncp').ncp,
	glob = require('glob'),
	babel = require('babel-core'),
	fs = require('fs'),
	config = require('..');

module.exports = function(args) {
	var sourceRoot = '.';
	var buildRoot = './build';

	var outputFlag = args.indexOf('-o');
	if(outputFlag>=0 && args[outputFlag+1]) {
		buildRoot = args[outputFlag+1];
	}

	console.log('Transpiling via Babel to ' + path.resolve(buildRoot));
	ncp(sourceRoot, buildRoot, {filter:/^(?!.*(node_modules|build|dist|\\.git)).*$/, stopOnErr:true}, function(ncpErr) {
		if(ncpErr) {
			console.error(ncpErr);
		} else {
			glob(buildRoot + '/**/*.js', {nodir:true}, function(globErr, files) {
				if(globErr) {
					console.error(globErr);
				} else {
					files.forEach(function(js) {
						babel.transformFile(js, {extends:config.babelrc}, function(babelErr, result) {
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
