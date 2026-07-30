const fs = require('fs');
const path = require('path');
const {resolveDevUtilsModule} = require('../resolve-dev-utils');

function resolveSnapshotHelper (name) {
	const candidates = [
		path.join(__dirname, '..', '..', '..', '..', 'dev-utils', 'plugins', 'SnapshotPlugin', `${name}.js`),
		path.join(__dirname, '..', '..', '..', 'dev-utils', 'plugins', 'SnapshotPlugin', `${name}.js`)
	];

	for (const candidate of candidates) {
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	try {
		return require.resolve(`@enact/dev-utils/plugins/SnapshotPlugin/${name}`);
	} catch (_e) {
		resolveDevUtilsModule(`plugins/SnapshotPlugin/${name}`);
		throw new Error(`Unable to resolve SnapshotPlugin helper: ${name}`);
	}
}

function packageMissing (context, lib) {
	return !fs.existsSync(path.join(context, 'node_modules', lib));
}

function createSnapshotEnactPlugin (options = {}) {
	const context = options.context;
	const helperJS = resolveSnapshotHelper('snapshot-helper');
	const helperReduxJS = resolveSnapshotHelper('snapshot-redux-helper');
	const reactDOMClient = path.join(context, 'node_modules', 'react-dom', 'client');
	const reduxPath = path.join(context, 'node_modules', 'react-redux');
	const reactRedux = fs.existsSync(reduxPath) ? reduxPath : null;
	const optionalMissing = [
		'@enact/i18n',
		'@enact/moonstone',
		'@enact/sandstone',
		'@enact/limestone',
		'@enact/core/snapshot'
	].filter(lib => packageMissing(context, lib));

	const ignoreIlib = ['ilib', '@enact/i18n/ilib'].every(lib => packageMissing(context, lib));

	return {
		name: 'enact-snapshot',
		setup (build) {
			build.onLoad({filter: /.*/, namespace: 'snapshot-empty'}, () => ({
				contents: 'module.exports = {};',
				loader: 'js'
			}));

			build.onResolve({filter: /.*/}, args => {
				if (args.kind !== 'import-statement' && args.kind !== 'require-call') {
					return undefined;
				}

				const issuer = args.importer || '';
				const fromHelper = issuer === helperJS || issuer === helperReduxJS;

				if (args.path === 'react-dom/client') {
					if (fromHelper) {
						return {path: reactDOMClient};
					}
					return {path: helperJS};
				}

				if (reactRedux && args.path === 'react-redux') {
					if (fromHelper) {
						return {path: reactRedux};
					}
					return {path: helperReduxJS};
				}

				for (const lib of optionalMissing) {
					if (args.path === lib || args.path.startsWith(`${lib}/`)) {
						if (issuer.startsWith(path.dirname(helperJS))) {
							return {path: args.path, namespace: 'snapshot-empty'};
						}
					}
				}

				if (ignoreIlib && (args.path === 'ilib' || args.path.startsWith('ilib/'))) {
					if (issuer.startsWith(path.dirname(helperJS))) {
						return {path: args.path, namespace: 'snapshot-empty'};
					}
				}

				return undefined;
			});
		}
	};
}

module.exports = {createSnapshotEnactPlugin, resolveSnapshotHelper};
