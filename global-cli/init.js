var
	path = require('path'),
	fs = require('fs'),
	ncp = require('ncp').ncp,
	cp = require('child_process');

module.exports = function(args) {
	var dest = '.';
	if(args[0]) {
		dest = args[0];
	}
	console.log('Initializing to project to ' + path.resolve(dest));
	ncp(path.join(__dirname, 'template'), dest, {stopOnErr:true}, function(ncpErr) {
		cp.exec('npm install', {env:process.env, cwd:path.resolve(dest)});
	});
};
