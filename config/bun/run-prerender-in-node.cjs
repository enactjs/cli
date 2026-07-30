'use strict';

const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function resolveNodeExecutable () {
	const candidates = [
		process.env.ENACT_NODE,
		process.env.npm_node_execpath,
		process.env.NODE_BINARY
	].filter(Boolean);

	for (const candidate of candidates) {
		if (!/bun/i.test(path.basename(candidate))) {
			return candidate;
		}
	}

	return 'node';
}

function runPrerenderInNode (prerenderOpts) {
	const node = resolveNodeExecutable();
	const worker = path.join(__dirname, 'prerender-worker.cjs');
	const optsFile = path.join(os.tmpdir(), `enact-prerender-${process.pid}-${Date.now()}.json`);

	fs.writeFileSync(optsFile, JSON.stringify(prerenderOpts), 'utf8');

	const result = spawnSync(node, [worker, optsFile], {
		stdio: 'inherit',
		cwd: prerenderOpts.context,
		env: process.env
	});

	try {
		fs.unlinkSync(optsFile);
	} catch (_e) {
		// ignore cleanup errors
	}

	if (result.error) {
		throw result.error;
	}
	if (result.status !== 0) {
		process.exit(result.status === null ? 1 : result.status);
	}
}

module.exports = {runPrerenderInNode};
