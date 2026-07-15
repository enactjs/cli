const STUB_NAMESPACE = 'enact-framework-stub';

const EXCLUDED_PACKAGES = new Set([
	'tape',
	'async_hooks',
	'vm',
	'node:async_hooks',
	'node:vm'
]);

const EXCLUDED_PATH_PATTERN = /[/\\]node_modules[/\\][^/\\]+[/\\]test\.js$|[/\\]node_modules[/\\](?:[^/\\]+[/\\])*(?:test|tests)[/\\]|\.test\.(?:js|cjs|mjs)$|[-.]specs?\.(?:js|cjs|mjs)$|react-dom-server\.node|ilib-node(?:-async|-assembled|-dyn)?\.js|AsyncNodeLoader\.js|NodeLoader\.js|RhinoLoader\.js|ilib-full-dyn-compiled\.js/;

function shouldExcludePath (filePath) {
	if (!filePath) return false;
	const request = filePath.replace(/\\/g, '/');
	return EXCLUDED_PATH_PATTERN.test(request);
}

function shouldExcludeFrameworkImport (args) {
	const request = args.path.replace(/\\/g, '/');

	if (EXCLUDED_PACKAGES.has(args.path) || EXCLUDED_PACKAGES.has(request)) {
		return true;
	}

	if (shouldExcludePath(request)) {
		return true;
	}

	if (args.importer) {
		const importer = args.importer.replace(/\\/g, '/');
		if (shouldExcludePath(importer)) {
			return true;
		}
	}

	return false;
}

function createFrameworkExclusionsPlugin () {
	return {
		name: 'enact-framework-exclusions',
		setup (build) {
			build.onResolve({filter: /^react-dom\/server$/}, () => {
				try {
					return {path: require.resolve('react-dom/server.browser')};
				} catch (_e) {
					return undefined;
				}
			});

			build.onResolve({filter: /.*/}, args => {
				if (!shouldExcludeFrameworkImport(args)) {
					return undefined;
				}

				return {
					path: args.path,
					namespace: STUB_NAMESPACE
				};
			});

			build.onLoad({filter: /.*/, namespace: STUB_NAMESPACE}, () => ({
				contents: 'module.exports = {};',
				loader: 'js'
			}));

			// Prevent Bun from parsing excluded files reached via absolute require() paths.
			build.onLoad({filter: /.*/}, args => {
				if (args.namespace !== 'file' || !args.path) {
					return undefined;
				}
				if (shouldExcludePath(args.path)) {
					return {contents: 'module.exports = {};', loader: 'js'};
				}
				return undefined;
			});
		}
	};
}

module.exports = {
	createFrameworkExclusionsPlugin,
	shouldExcludeFrameworkImport,
	shouldExcludePath
};
