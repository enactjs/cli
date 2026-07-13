const fs = require('fs');

const ISOMORPHIC_EXTERNALS = [
	'react',
	'react-dom',
	'react-dom/client',
	'react/jsx-runtime',
	'react/jsx-dev-runtime'
];

function getIsomorphicExternals () {
	return ISOMORPHIC_EXTERNALS;
}

function wrapIsomorphicBundle (code, globalName = 'App') {
	const body = code.replace(/^\uFEFF?#![^\n]*\n/, '');
	return [
		`(function (root, factory) {`,
		`\tif (typeof module === 'object' && typeof module.exports !== 'undefined') {`,
		`\t\tmodule.exports = factory(root, typeof require === 'function' ? require : null);`,
		`\t} else {`,
		`\t\troot.${globalName} = factory(root, null);`,
		`\t}`,
		`})(typeof self !== 'undefined' ? self : this, function (root, nodeRequire) {`,
		`\tvar exports = {};`,
		`\tvar module = { exports: exports };`,
		`\tvar require = nodeRequire || function (name) {`,
		`\t\tif (name === 'react') return root.React || globalThis.React;`,
		`\t\tif (name === 'react/jsx-runtime' || name === 'react/jsx-dev-runtime') {`,
		`\t\t\tvar React = root.React || globalThis.React;`,
		`\t\t\treturn { jsx: React.createElement, jsxs: React.createElement, Fragment: React.Fragment };`,
		`\t\t}`,
		`\t\tif (name === 'react-dom/client') return root.ReactDOMClient || globalThis.ReactDOMClient;`,
		`\t\tif (name === 'react-dom') return root.ReactDOM || globalThis.ReactDOM;`,
		`\t\tthrow new Error('Cannot find module ' + name);`,
		`\t};`,
		`\t(function () {`,
		body,
		`\t})();`,
		`\treturn module.exports && module.exports.default !== undefined ? module.exports.default : module.exports;`,
		`});`,
		''
	].join('\n');
}

function createIsomorphicEnactPlugin (options = {}) {
	const reactPackages = getIsomorphicExternals();

	return {
		name: 'enact-isomorphic',
		setup (build) {
			if (!options.useExternals) {
				build.onResolve({filter: /^react(-dom)?(\/.*)?$/}, args => {
					if (reactPackages.includes(args.path)) {
						return {path: args.path, external: true};
					}
					return undefined;
				});
			}

			build.onEnd (result => {
				if (!options.isomorphic || !result.success) return;

				for (const output of result.outputs) {
					if (!output.path.endsWith('.js')) continue;
					const code = fs.readFileSync(output.path, {encoding: 'utf8'});
					fs.writeFileSync(output.path, wrapIsomorphicBundle(code, options.globalName || 'App'), {encoding: 'utf8'});
				}
			});
		}
	};
}

module.exports = {createIsomorphicEnactPlugin, wrapIsomorphicBundle, getIsomorphicExternals};
