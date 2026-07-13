const fs = require('fs');
const path = require('path');

function createCaseSensitiveEnactPlugin (options = {}) {
	if (process.platform === 'win32' || process.platform === 'darwin') {
		return null;
	}

	const realpathSync = fs.realpathSync.native || fs.realpathSync;

	return {
		name: 'enact-case-sensitive-paths',
		setup (build) {
			build.onResolve({filter: /.*/}, args => {
				if (args.namespace !== 'file' && args.namespace) {
					return undefined;
				}
				if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) {
					return undefined;
				}

				const resolved = path.isAbsolute(args.path)
					? args.path
					: path.resolve(args.resolveDir, args.path);

				if (!fs.existsSync(resolved)) {
					return undefined;
				}

				try {
					const real = realpathSync(resolved);
					if (real !== resolved) {
						throw new Error(
							`Cannot resolve path '${args.path}' with different casing than the real path '${real}'.`
						);
					}
				} catch (e) {
					if (e.code === 'ENOENT') {
						return undefined;
					}
					throw e;
				}

				return undefined;
			});
		}
	};
}

module.exports = {createCaseSensitiveEnactPlugin};
