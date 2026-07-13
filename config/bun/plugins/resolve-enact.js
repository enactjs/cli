const path = require('path');
const fs = require('fs');

function normalizeBundlerPath (filePath) {
	return filePath.replace(/\\/g, '/');
}

function createResolveEnactPlugin (options = {}) {
	const context = options.context || process.cwd();
	const aliases = options.aliases || {};

	return {
		name: 'enact-resolve',
		setup (build) {
			build.onResolve({filter: /.*/}, args => {
				for (const [key, target] of Object.entries(aliases)) {
					if (args.path === key) {
						let resolved = target;
						if (!path.isAbsolute(target) && !target.startsWith('@')) {
							resolved = path.join(context, target);
						} else {
							try {
								resolved = require.resolve(target, {paths: [context, args.importer].filter(Boolean)});
							} catch (e) {
								return undefined;
							}
						}
						return {path: normalizeBundlerPath(resolved)};
					}
				}

				if (args.path === 'ilib' || args.path === '@enact/i18n/ilib') {
					const checks = ['@enact/i18n/ilib', 'ilib'];
					for (const check of checks) {
						try {
							return {
								path: normalizeBundlerPath(require.resolve(check, {paths: [context, args.importer].filter(Boolean)}))
							};
						} catch (e) {
							// continue
						}
					}
				}

				return undefined;
			});

			build.onLoad({filter: /node_modules[/\\]ilib[/\\]index\.js$/}, async args => {
				let source = await Bun.file(args.path).text();
				source = source.replace(/require\("\.\/lib\/ilib-[^"]+"\)/g, 'undefined');
				return {loader: 'js', contents: source};
			});
		}
	};
}

module.exports = {createResolveEnactPlugin, normalizeBundlerPath};
