const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

function firstExisting (paths) {
	for (const candidate of paths) {
		if (candidate && fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
}

function resolveBundledBun () {
	const cliRoot = path.join(__dirname, '..', '..');
	const bunRoot = path.join(cliRoot, 'node_modules', 'bun');

	return firstExisting([
		path.join(bunRoot, 'bin', 'bun'),
		// npm postinstall always links the native binary to bun.exe (all platforms)
		path.join(bunRoot, 'bin', 'bun.exe'),
		path.join(cliRoot, 'node_modules', '.bin', 'bun')
	]);
}

function resolveOvenBun () {
	const {platform, arch} = process;
	const names = [];

	if (platform === 'linux') {
		names.push(
			`@oven/bun-linux-${arch}`,
			`@oven/bun-linux-${arch}-baseline`,
			`@oven/bun-linux-${arch}-musl`,
			`@oven/bun-linux-${arch}-musl-baseline`
		);
	} else if (platform === 'darwin') {
		names.push(
			`@oven/bun-darwin-${arch}`,
			`@oven/bun-darwin-${arch}-baseline`
		);
	} else if (platform === 'win32') {
		names.push(
			`@oven/bun-windows-${arch}`,
			`@oven/bun-windows-${arch}-baseline`
		);
	}

	for (const name of names) {
		for (const exe of ['bin/bun', 'bin/bun.exe']) {
			try {
				const resolved = require.resolve(`${name}/${exe}`);
				if (fs.existsSync(resolved)) {
					return resolved;
				}
			} catch (err) {
				// optional platform package not installed
			}
		}
	}

	return null;
}

function resolveBun () {
	const bundled = resolveBundledBun();
	if (bundled) return bundled;

	const oven = resolveOvenBun();
	if (oven) return oven;

	const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['bun'], {
		encoding: 'utf8'
	});
	if (which.status === 0 && which.stdout.trim()) {
		return which.stdout.trim().split(/\r?\n/)[0];
	}

	throw new Error(
		'Bun is required but was not found. Install Bun 1.3+ from https://bun.com and ensure it is on your PATH.'
	);
}

module.exports = {resolveBun};
