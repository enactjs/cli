var
	path = require('path'),
	fs = require('fs'),
	cp = require('child_process'),
	chalk = require('chalk');

function isNodeOutputFS(compiler) {
	try {
		var NodeOutputFileSystem = require('webpack/lib/node/NodeOutputFileSystem');
		return (compiler.outputFileSystem.writeFile===NodeOutputFileSystem.prototype.writeFile);
	} catch(e) {
		console.error('SnapshotPlugin loader is not compatible with standalone global installs of Webpack.');
		return false;
	}
}

function getBlobName(args) {
	for(var i=0; i<args.length; i++) {
		if(args[i].indexOf('--startup-blob=')===0) {
			return args[i].replace('--startup-blob=', '');
		}
	}
}

function SnapshotPlugin(options) {
	this.options = options || {};
	this.options.exec = this.options.exec || process.env.V8_MKSNAPSHOT;
	this.options.args = this.options.args || [
		'--profile-deserialization',
		'--random-seed',
		'314159265',
		'--startup-blob=snapshot_blob.bin'
	];
	this.options.args.push(this.options.target || 'main.js');
}
module.exports = SnapshotPlugin;
SnapshotPlugin.prototype.apply = function(compiler) {
	var opts = this.options;

	compiler.plugin('after-emit', function(compilation, callback) {
		if(isNodeOutputFS(compiler) && opts.exec) {
			// Append anything optional to the js to be included in the snapshot
			if(opts.append) {
				fs.appendFileSync(path.join(compiler.options.output.path, opts.target), opts.append, {encoding:'utf8'});
			}
			// Run mksnapshot utility
			var child = cp.spawnSync(opts.exec, opts.args, {
				cwd: compiler.options.output.path,
				stdio: ['ignore', 'ignore', 'ignore']
			});
			if(child.status === 0) {
				// Add snapshot to the compilation assets array for stats purposes
				var blob = getBlobName(opts.args);
				if(blob) {
					var stat = fs.statSync(path.join(compiler.options.output.path, blob));
					compilation.assets[blob] = {
						size: function() { return stat.size; },
						emitted: true
					};
				}
			} else {
				chalk.orange('Snapshot blob generation failed.')
			}
			callback(child.error);
		} else {
			callback();
		}
	});
};
