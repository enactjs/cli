const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

function getBlobName (args) {
	for (let i = 0; i < args.length; i++) {
		if (args[i].indexOf('--startup-blob=') === 0) {
			return args[i].replace('--startup-blob=', '');
		}
	}
	return 'snapshot_blob.bin';
}

function getSnapshotArgs (target) {
	let args = [
		'--profile-deserialization',
		'--random-seed=314159265',
		'--abort_on_uncaught_exception',
		'--startup-blob=snapshot_blob.bin'
	];

	if (process.env.V8_SNAPSHOT_ARGS) {
		args = process.env.V8_SNAPSHOT_ARGS.split(/\s+/);
	}

	args.push(target);
	return args;
}

function updateAppinfoV8Snapshot (output, blobPath) {
	const normalizedBlob = blobPath.replace(/\\/g, '/');
	const appinfoFiles = glob.sync('**/appinfo.json', {
		cwd: output,
		absolute: true,
		nodir: true
	});

	for (const appinfoPath of appinfoFiles) {
		const meta = JSON.parse(fs.readFileSync(appinfoPath, {encoding: 'utf8'}));
		meta.v8SnapshotFile = normalizedBlob;
		fs.writeFileSync(appinfoPath, JSON.stringify(meta, null, '\t') + '\n', {encoding: 'utf8'});
	}
}

function applySnapshot (options = {}) {
	const exec = options.exec || process.env.V8_MKSNAPSHOT;
	const target = options.target || 'main.js';
	const output = path.resolve(options.output);
	const args = getSnapshotArgs(target);
	const blob = getBlobName(args);

	if (!exec) {
		return null;
	}

	const child = cp.spawnSync(exec, args, {cwd: output, encoding: 'utf8'});
	if (child.status !== 0) {
		const message = child.stderr || child.stdout || 'V8 snapshot generation failed.';
		import('chalk').then(({default: chalk}) => {
			console.log(
				chalk.red(
					'Snapshot blob generation "' + exec + ' ' + args.join(' ') + '" in "' + output + '" directory failed:'
				)
			);
		});
		throw new Error(message);
	}

	const blobPath = path.join(output, blob);
	if (!fs.existsSync(blobPath)) {
		throw new Error('V8 snapshot blob was not generated at ' + blob);
	}

	const stat = fs.statSync(blobPath);
	if (stat.size === 0) {
		throw new Error((child.stdout || '') + '\n' + (child.stderr || ''));
	}

	const snapshotMetaPath = options.v8SnapshotFile || blob;
	updateAppinfoV8Snapshot(output, snapshotMetaPath);
	return blobPath;
}

module.exports = {applySnapshot, updateAppinfoV8Snapshot, getSnapshotArgs};
