const path = require('path');

function resolveTildeImport (packagePath, fromDir, appContext = process.cwd()) {
	const searchPaths = [
		fromDir,
		appContext,
		path.join(appContext, 'node_modules')
	];

	for (const searchPath of searchPaths) {
		try {
			return require.resolve(packagePath, {paths: [searchPath]});
		} catch (e) {
			// try next search path
		}
	}

	throw new Error(`Could not resolve: ~${packagePath}`);
}

function toCssRelativeImport (fromDir, resolvedPath) {
	let relativePath = path.relative(fromDir, resolvedPath).replace(/\\/g, '/');
	if (!relativePath.startsWith('.')) {
		relativePath = `./${relativePath}`;
	}
	return relativePath;
}

function parseImportPath (params) {
	const trimmed = params.trim();
	const urlMatch = trimmed.match(/^url\(\s*(['"]?)([^'")]+)\1\s*\)$/i);
	if (urlMatch) {
		return urlMatch[2];
	}

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}

	return trimmed;
}

function formatImportParams (params, resolvedRelativePath) {
	const trimmed = params.trim();
	if (/^url\(/i.test(trimmed)) {
		return `url("${resolvedRelativePath}")`;
	}
	return `"${resolvedRelativePath}"`;
}

module.exports = {
	resolveTildeImport,
	toCssRelativeImport,
	parseImportPath,
	formatImportParams
};
