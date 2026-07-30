const fs = require('fs-extra');
const path = require('path');
const {applyWebOSMeta} = require('./webos-meta');
const {applyIlibResources} = require('./ilib-meta');

function copyDir (from, to) {
	if (fs.existsSync(from)) {
		fs.copySync(from, to, {dereference: true});
	}
}

function copyPublicFolder (context, output) {
	const publicDir = path.join(context, 'public');
	if (fs.existsSync(publicDir)) {
		fs.copySync(publicDir, output, {dereference: true});
	}
}

function ensureCustomizationsDir (output) {
	fs.ensureDirSync(path.join(output, 'customizations'));
}

async function applyPostBuild (context, output, options = {}) {
	copyPublicFolder(context, output);
	await applyIlibResources(context, output, {
		ilibAdditionalResourcesPath: options.ilibAdditionalResourcesPath,
		create: true,
		cache: options.cache !== false
	});
	applyWebOSMeta(context, output, {
		v8SnapshotFile: options.v8SnapshotFile
	});
	if (options.customSkin) {
		ensureCustomizationsDir(output);
	}
	if (options.ilibAdditionalResourcesPath && fs.existsSync(options.ilibAdditionalResourcesPath)) {
		copyDir(options.ilibAdditionalResourcesPath, path.join(output, 'resources'));
	}
}

module.exports = {applyPostBuild, copyPublicFolder};
