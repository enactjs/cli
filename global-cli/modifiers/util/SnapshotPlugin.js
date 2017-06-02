const
	path = require('path'),
	fs = require('fs'),
	cp = require('child_process'),
	exists = require('path-exists').sync,
	findCacheDir = require('find-cache-dir'),
	chalk = require('chalk');

// Determine if it's a NodeJS output filesystem or if it's a foreign/virtual one.
function isNodeOutputFS(compiler) {
	return (compiler.outputFileSystem
			&& compiler.outputFileSystem.constructor
			&& compiler.outputFileSystem.constructor.name
			&& compiler.outputFileSystem.constructor.name === 'NodeOutputFileSystem');
}

function getBlobName(args) {
	for(let i=0; i<args.length; i++) {
		if(args[i].indexOf('--startup-blob=')===0) {
			return args[i].replace('--startup-blob=', '');
		}
	}
	return 'snapshot_blob.bin';
}

function SnapshotPlugin(options) {
	this.options = options || {};
	this.options.exec = this.options.exec || process.env.V8_MKSNAPSHOT;
	this.options.args = this.options.args || [
		'--profile-deserialization',
		'--random-seed=314159265',
		'--startup-blob=snapshot_blob.bin'
	];
	if(process.env.V8_SNAPSHOT_ARGS) {
		this.options.args = process.env.V8_SNAPSHOT_ARGS.split(/\s+/);
	}
	this.options.args.push(this.options.target || 'main.js');
}
module.exports = SnapshotPlugin;
SnapshotPlugin.prototype.apply = function(compiler) {
	const opts = this.options;
	opts.blob = getBlobName(opts.args);

	// Record the v8 blob file in the root appinfo if applicable
	compiler.plugin('compilation', (compilation) => {
		compilation.plugin('webos-meta-root-appinfo', (meta) => {
			meta.v8SnapshotFile = opts.blob;
			return meta;
		});
	});

	compiler.plugin('after-emit', (compilation, callback) => {
		if(isNodeOutputFS(compiler) && opts.exec) {
			const ssCache = path.join(findCacheDir({
				name: 'enact-dev',
				create: true
			}), 'snapshot-target.js');

			// Append anything optional to the js to be included in the snapshot
			if(opts.prepend || opts.append) {
				let text = opts.prepend || '';
				text += fs.readFileSync(path.join(compiler.options.output.path, opts.target), {encoding:'utf8'});
				text += opts.append || '';
				fs.writeFileSync(ssCache, text, {encoding:'utf8'});
				opts.args[opts.args.length-1] = path.resolve(ssCache);
			}

			// Run mksnapshot utility
			let err;
			const child = cp.spawnSync(opts.exec, opts.args, {
				cwd: compiler.options.output.path,
				encoding: 'utf8'
			});

			if(child.status === 0) {
				// Add snapshot to the compilation assets array for stats purposes
				try {
					const stat = fs.statSync(path.join(compiler.options.output.path, opts.blob));
					if(stat.size>0) {
						compilation.assets[opts.blob] = {
							size: function() { return stat.size; },
							emitted: true
						};
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

			// cleanup any temporary data
			if(exists(ssCache)) {
				fs.unlinkSync(ssCache);
			}

			callback(err);
		} else {
			callback();
		}
	});
};
