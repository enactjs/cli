var
	path = require('path'),
	fs = require('fs'),
	cp = require('child_process'),
	exists = require('path-exists').sync,
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
	return 'snapshot_blob.bin';
}

function updateAppInfo(output, blob) {
	var appInfo = path.join(output, 'appinfo.json');
	if(exists(appInfo)) {
		try {
			var meta = JSON.parse(fs.readFileSync(appInfo, {encoding:'utf8'}));
			meta.v8SnapshotFile = blob;
			fs.writeFileSync(appInfo, JSON.stringify(meta, null, '\t'), {encoding:'utf8'});
		} catch(e) {
			return new Error('Failed to set "v8SnapshotFile" property in appinfo.json');
		}
	}
}

function SnapshotPlugin(options) {
	this.options = options || {};
	this.options.exec = this.options.exec || process.env.V8_MKSNAPSHOT;
	this.options.args = this.options.args || [
		'--profile-deserialization',
		'--random-seed=314159265',
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
			var err;
			var child = cp.spawnSync(opts.exec, opts.args, {
				cwd: compiler.options.output.path,
				encoding: 'utf8'
			});

			if(child.status === 0) {
				// Add snapshot to the compilation assets array for stats purposes
				var blob = getBlobName(opts.args);
				try {
					var stat = fs.statSync(path.join(compiler.options.output.path, blob));
					if(stat.size>0) {
						compilation.assets[blob] = {
							size: function() { return stat.size; },
							emitted: true
						};
						err = updateAppInfo(compiler.options.output.path, blob);
					} else {
						// Temporary fix: mksnapshot may create a 0-byte blob on error
						err = new Error(child.stdout + '\n' + child.stderr);
					}
				} catch(e) {
					// Temporary fix: mksnapshot always returns exit code 0, even on error.
					// Exception thrown when file not found
					err = new Error(child.stdout + '\n' + child.stderr);
				}
			} else {
				err = new Error(child.stdout + '\n' + child.stderr);
			}

			if(err) {
				console.log(chalk.red('Snapshot blob generation failed.'));
			}
			callback(err);
		} else {
			callback();
		}
	});
};
