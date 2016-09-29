var
	path = require('path'),
	fs = require('fs'),
	ncp = require('ncp').ncp,
	cp = require('child_process');

module.exports = function(args) {
	var dest = '.';
	var opts = [];
	var i = args.indexOf('--link');
	if(i>=0) {
		opts.push('--link');
		args.splice(i, 1);
	}
	if(args[0]) {
		dest = args[0];
	}
	console.log('Initializing new project in ' + path.resolve(dest));
	ncp(path.join(__dirname, 'template'), dest, {stopOnErr:true}, function(ncpErr) {
		var npm = cp.exec('npm --loglevel error install ' + opts.join(' '), {env:process.env, cwd:path.resolve(dest)});
		npm.stdout.pipe(process.stdout);
		npm.stderr.pipe(process.stderr);
	});
};
