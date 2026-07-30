'use strict';

const fs = require('fs');
const path = require('path');

const optionsFile = process.argv[2];
if (!optionsFile) {
	console.error('Missing prerender options file');
	process.exit(1);
}

const prerenderOpts = JSON.parse(fs.readFileSync(optionsFile, 'utf8'));
const bunDir = __dirname;

process.chdir(prerenderOpts.context);

const appModules = path.join(prerenderOpts.context, 'node_modules');
if (fs.existsSync(appModules)) {
	module.paths.unshift(appModules);
}

const {createBuildOptions} = require(path.join(bunDir, 'build-options'));
const {applyPrerender} = require(path.join(bunDir, 'prerender'));

createBuildOptions({
	isomorphic: true,
	context: prerenderOpts.context,
	output: prerenderOpts.output,
	externals: prerenderOpts.externals
});

try {
	applyPrerender(prerenderOpts);
} catch (e) {
	console.error(e.stack || e.message || e);
	process.exit(1);
}
