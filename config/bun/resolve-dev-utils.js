const fs = require('fs');
const path = require('path');

function getWorkspaceDevUtilsRoots () {
	return [
		path.join(__dirname, '..', '..', '..', 'dev-utils'),
		path.join(__dirname, '..', '..', '..', '..', 'dev-utils')
	];
}

function resolveModulePath (basePath) {
	if (fs.existsSync(`${basePath}.js`)) {
		return basePath;
	}
	if (fs.existsSync(path.join(basePath, 'index.js'))) {
		return path.join(basePath, 'index.js');
	}
	return null;
}

function resolveDevUtilsModule (subpath) {
	try {
		return require(`@enact/dev-utils/${subpath}`);
	} catch (_e) {
		// continue
	}

	try {
		const pkgRoot = path.dirname(require.resolve('@enact/dev-utils/package.json'));
		const localPath = path.join(pkgRoot, subpath.replace(/\//g, path.sep));
		const resolved = resolveModulePath(localPath);
		if (resolved) {
			return require(resolved);
		}
	} catch (_e) {
		// continue
	}

	for (const root of getWorkspaceDevUtilsRoots()) {
		const localPath = path.join(root, subpath.replace(/\//g, path.sep));
		const resolved = resolveModulePath(localPath);
		if (resolved) {
			return require(resolved);
		}
	}

	return null;
}

module.exports = {resolveDevUtilsModule, getWorkspaceDevUtilsRoots};
